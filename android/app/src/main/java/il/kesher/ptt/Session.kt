package il.kesher.ptt

import android.content.Context

class Session(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("kesher", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server", "http://10.0.2.2:8080") ?: ""
        set(value) { prefs.edit().putString("server", value.trimEnd('/')).apply() }

    var dark: Boolean
        get() = prefs.getBoolean("dark", false)
        set(value) { prefs.edit().putBoolean("dark", value).apply() }

    var token: String?
        get() = prefs.getString("token", null)
        set(value) { prefs.edit().putString("token", value).apply() }

    var callSign: String
        get() = prefs.getString("callSign", "") ?: ""
        set(value) { prefs.edit().putString("callSign", value).apply() }

    var userId: String
        get() = prefs.getString("userId", "") ?: ""
        set(value) { prefs.edit().putString("userId", value).apply() }

    fun clearAuth() {
        prefs.edit().remove("token").apply()
    }
}
