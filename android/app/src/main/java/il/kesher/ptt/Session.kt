package il.kesher.ptt

import android.content.Context

class Session(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("kesher", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server", "http://192.168.1.10:8080") ?: ""
        set(value) { prefs.edit().putString("server", value.trimEnd('/')).apply() }

    var token: String?
        get() = prefs.getString("token", null)
        set(value) { prefs.edit().putString("token", value).apply() }

    var callSign: String
        get() = prefs.getString("callSign", "") ?: ""
        set(value) { prefs.edit().putString("callSign", value).apply() }

    var displayName: String
        get() = prefs.getString("displayName", "") ?: ""
        set(value) { prefs.edit().putString("displayName", value).apply() }

    fun clearAuth() {
        prefs.edit().remove("token").apply()
    }
}
