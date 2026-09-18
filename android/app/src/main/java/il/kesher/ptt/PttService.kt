package il.kesher.ptt

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

class PttService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("kesher", "קשר", NotificationManager.IMPORTANCE_LOW))
        val n = NotificationCompat.Builder(this, "kesher")
            .setContentTitle("קשר פעיל")
            .setContentText("שירות מיקום ושמע ברקע")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build()
        startForeground(7, n)
    }
}

object RadioBus {
    @Volatile var socket: Socket? = null
    val audio = AudioEngine()

    fun connect(server: String, token: String): Socket {
        socket?.disconnect()
        val opts = IO.Options.builder()
            .setAuth(mapOf("token" to token))
            .setTransports(arrayOf("websocket", "polling"))
            .setReconnection(true)
            .build()
        val s = IO.socket(URI.create(server), opts)
        socket = s
        s.connect()
        return s
    }
}
