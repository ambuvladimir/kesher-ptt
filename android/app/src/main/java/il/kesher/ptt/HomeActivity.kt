package il.kesher.ptt

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import il.kesher.ptt.databinding.ActivityHomeBinding
import kotlin.concurrent.thread

class HomeActivity : AppCompatActivity() {
    private lateinit var binding: ActivityHomeBinding
    private lateinit var session: Session

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = Session(this)
        if (session.token.isNullOrBlank()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        applyTheme()
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.welcome.text = "${session.callSign} · ${session.displayName}"
        thread {
            try {
                val b = Api.branding(session.serverUrl)
                val bmp = Api.logoBitmap(session.serverUrl, b.optString("logoUrl"))
                runOnUiThread {
                    val n = b.optString("name")
                    if (n.isNotBlank()) binding.companyName.text = n
                    if (bmp != null) binding.logoView.setImageBitmap(bmp)
                }
            } catch (_: Exception) {
            }
        }
        binding.radioBtn.setOnClickListener {
            startActivity(Intent(this, RadioActivity::class.java))
        }
        binding.themeBtn.setOnClickListener {
            session.dark = !session.dark
            applyTheme()
        }
        binding.logoutBtn.setOnClickListener {
            session.clearAuth()
            RadioBus.socket?.disconnect()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }

    private fun applyTheme() {
        AppCompatDelegate.setDefaultNightMode(
            if (session.dark) AppCompatDelegate.MODE_NIGHT_YES else AppCompatDelegate.MODE_NIGHT_NO
        )
    }
}
