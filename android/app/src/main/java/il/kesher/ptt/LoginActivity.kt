package il.kesher.ptt

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import il.kesher.ptt.databinding.ActivityLoginBinding
import kotlin.concurrent.thread

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var session: Session

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = Session(this)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.serverUrl.setText(session.serverUrl)
        requestPerms()

        binding.loginBtn.setOnClickListener {
            val server = binding.serverUrl.text.toString().trim()
            val user = binding.username.text.toString().trim()
            val pass = binding.password.text.toString()
            binding.errorText.text = ""
            thread {
                try {
                    val res = Api.login(server, user, pass)
                    val token = res.getString("token")
                    val profile = res.getJSONObject("user")
                    runOnUiThread {
                        session.serverUrl = server
                        session.token = token
                        session.callSign = profile.optString("callSign")
                        session.displayName = profile.optString("displayName")
                        session.userId = profile.optString("id")
                        startActivity(Intent(this, HomeActivity::class.java))
                        finish()
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        RadioTones.error()
                        binding.errorText.text = e.message
                    }
                }
            }
        }
    }

    private fun requestPerms() {
        val need = arrayOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.POST_NOTIFICATIONS
        ).filter { ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (need.isNotEmpty()) ActivityCompat.requestPermissions(this, need.toTypedArray(), 1)
        else Unit
        if (need.isNotEmpty()) Toast.makeText(this, "נדרשות הרשאות מיקרופון ומיקום", Toast.LENGTH_LONG).show()
    }
}
