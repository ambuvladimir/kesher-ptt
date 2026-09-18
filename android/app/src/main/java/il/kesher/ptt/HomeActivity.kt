package il.kesher.ptt

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import il.kesher.ptt.databinding.ActivityHomeBinding

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
