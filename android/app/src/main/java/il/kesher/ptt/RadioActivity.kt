package il.kesher.ptt

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.view.MotionEvent
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import il.kesher.ptt.databinding.ActivityRadioBinding
import io.socket.emitter.Emitter
import org.json.JSONObject
import kotlin.concurrent.thread

class RadioActivity : AppCompatActivity(), LocationListener {
    private lateinit var binding: ActivityRadioBinding
    private lateinit var session: Session
    private var channels: List<Channel> = emptyList()
    private var contacts: List<Contact> = emptyList()
    private var selected: String = ""
    private var talking = false

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = Session(this)
        val token = session.token
        if (token.isNullOrBlank()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        binding = ActivityRadioBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.callSign.text = "${session.callSign} · ${session.displayName}"
        startService(Intent(this, PttService::class.java))

        thread {
            try {
                channels = Api.channels(session.serverUrl, token).filter { it.kind != "direct" }
                contacts = Api.users(session.serverUrl, token).filter { it.id != session.userId }
                runOnUiThread {
                    renderChannels()
                    renderContacts()
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this, e.message, Toast.LENGTH_LONG).show() }
            }
        }

        val socket = RadioBus.connect(session.serverUrl, token)
        socket.on("ptt:granted") {
            talking = true
            RadioTones.start()
            RadioBus.audio.resetPlayback()
            RadioBus.audio.startCapture { bytes ->
                socket.emit("ptt:audio", selected, bytes)
            }
            runOnUiThread { binding.statusText.text = "אתה משדר" }
        }
        socket.on("ptt:denied", Emitter.Listener { args ->
            val reason = (args.firstOrNull() as? JSONObject)?.optString("reason") ?: "נדחה"
            RadioTones.error()
            runOnUiThread { binding.statusText.text = reason }
        })
        socket.on("ptt:start", Emitter.Listener { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@Listener
            if (o.optString("channelId") != selected) return@Listener
            val fromSelf = o.optString("userId") == session.userId
            runOnUiThread { binding.statusText.text = "באוויר: ${o.optString("callSign")}" }
            if (!fromSelf) {
                RadioBus.audio.resetPlayback()
                RadioTones.incoming(false)
            }
        })
        socket.on("ptt:end") {
            talking = false
            RadioBus.audio.stopCapture()
            RadioTones.stopIncoming()
            RadioTones.end()
            runOnUiThread { binding.statusText.text = "מוכן לקשר" }
        }
        socket.on("ptt:audio", Emitter.Listener { args ->
            val parsed = parseAudio(args) ?: return@Listener
            val (pcm, ch) = parsed
            if (!ch.isNullOrEmpty() && ch != selected) return@Listener
            RadioTones.stopIncoming()
            RadioBus.audio.play(pcm)
        })
        socket.on("direct:open", Emitter.Listener { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@Listener
            val ch = o.optJSONObject("channel") ?: return@Listener
            val id = ch.optString("id")
            val name = ch.optString("name")
            val fromId = o.optJSONObject("from")?.optString("id")
            if (fromId != session.userId) RadioTones.incoming(true)
            runOnUiThread {
                selected = id
                binding.statusText.text = if (fromId != session.userId) "שיחה נכנסת: $name" else "שיחה אישית: $name"
            }
            socket.emit("channel:join", JSONObject().put("channelId", id))
            socket.emit("channel:select", JSONObject().put("channelId", id))
        })
        socket.on("emergency:alert", Emitter.Listener { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@Listener
            RadioTones.emergency()
            runOnUiThread { binding.statusText.text = "חירום: ${o.optString("callSign")}" }
        })

        binding.pttBtn.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (selected.isNotEmpty()) socket.emit("ptt:request", JSONObject().put("channelId", selected))
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    RadioBus.audio.stopCapture()
                    if (selected.isNotEmpty()) socket.emit("ptt:release", JSONObject().put("channelId", selected))
                    talking = false
                    true
                }
                else -> false
            }
        }

        binding.emergencyBtn.setOnClickListener {
            RadioTones.emergency()
            socket.emit("emergency", JSONObject().put("note", "קריאת חירום מהשטח"))
        }
        binding.homeBtn.setOnClickListener {
            startActivity(Intent(this, HomeActivity::class.java))
            finish()
        }

        startLocation()
    }

    private fun renderChannels() {
        binding.channelRow.removeAllViews()
        channels.forEach { ch ->
            val b = Button(this)
            b.text = ch.name
            b.setOnClickListener {
                selected = ch.id
                RadioBus.socket?.emit("channel:select", JSONObject().put("channelId", selected))
                binding.statusText.text = "${ch.name} · ${ch.code}"
            }
            binding.channelRow.addView(b)
        }
        channels.firstOrNull { it.kind != "direct" }?.let {
            selected = it.id
            RadioBus.socket?.emit("channel:select", JSONObject().put("channelId", selected))
        }
    }

    private fun renderContacts() {
        binding.contactRow.removeAllViews()
        contacts.forEach { person ->
            val b = Button(this)
            b.text = "${person.callSign} ${person.name}"
            b.setOnClickListener {
                RadioBus.socket?.emit("direct:open", JSONObject().put("peerId", person.id))
                binding.statusText.text = "שיחה אישית עם ${person.callSign}"
            }
            binding.contactRow.addView(b)
        }
    }

    private fun startLocation() {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000L, 5f, this)
        lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 8000L, 10f, this)
    }

    override fun onLocationChanged(location: Location) {
        val o = JSONObject()
            .put("lat", location.latitude)
            .put("lng", location.longitude)
            .put("accuracy", location.accuracy.toDouble())
            .put("speed", location.speed.toDouble())
            .put("heading", location.bearing.toDouble())
        RadioBus.socket?.emit("location:update", o)
    }

    override fun onDestroy() {
        RadioTones.stopIncoming()
        RadioBus.audio.release()
        super.onDestroy()
    }
}

private fun parseAudio(args: Array<out Any>): Pair<ByteArray, String?>? {
    if (args.isEmpty()) return null
    val a0 = args[0]
    if (a0 is String && args.size > 1) {
        val pcm = args[1] as? ByteArray ?: return null
        return pcm to a0
    }
    val pcm = a0 as? ByteArray ?: return null
    val ch = (args.getOrNull(1) as? JSONObject)?.optString("channelId")
    return pcm to ch
}
