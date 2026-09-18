package il.kesher.ptt

import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class Channel(val id: String, val name: String, val code: String, val kind: String)
data class Contact(val id: String, val name: String, val callSign: String, val role: String, val status: String)

object Api {
    fun login(base: String, username: String, password: String): JSONObject {
        val body = JSONObject().put("username", username).put("password", password)
        return request(base, "/api/auth/login", "POST", body, null)
    }

    fun channels(base: String, token: String): List<Channel> {
        val json = request(base, "/api/channels", "GET", null, token)
        val arr: JSONArray = if (json.has("length")) json.optJSONArray("data") ?: JSONArray() else {
            // Fastify returns a raw array; wrap via toString parse
            JSONArray(json.toString().let { if (it.startsWith("[")) it else json.optJSONArray("channels")?.toString() ?: "[]" })
        }
        val list = mutableListOf<Channel>()
        // When server returns array, Http helper stores it under "items"
        val items = json.optJSONArray("items") ?: arr
        for (i in 0 until items.length()) {
            val o = items.getJSONObject(i)
            list += Channel(o.getString("id"), o.getString("name"), o.getString("code"), o.getString("kind"))
        }
        return list
    }

    fun users(base: String, token: String): List<Contact> {
        val json = request(base, "/api/users", "GET", null, token)
        val items = json.optJSONArray("items") ?: JSONArray()
        val list = mutableListOf<Contact>()
        for (i in 0 until items.length()) {
            val o = items.getJSONObject(i)
            list += Contact(
                o.getString("id"),
                o.optString("displayName"),
                o.optString("callSign"),
                o.optString("role"),
                o.optString("status")
            )
        }
        return list
    }

    fun request(base: String, path: String, method: String, body: JSONObject?, token: String?): JSONObject {
        val conn = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 12000
        conn.readTimeout = 12000
        if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
        if (body != null) {
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
        }
        val text = (if (conn.responseCode >= 400) conn.errorStream else conn.inputStream)
            .bufferedReader().readText()
        if (conn.responseCode >= 400) {
            val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
            throw RuntimeException(err ?: "שגיאת שרת ${conn.responseCode}")
        }
        val trimmed = text.trim()
        return if (trimmed.startsWith("[")) JSONObject().put("items", JSONArray(trimmed))
        else JSONObject(trimmed)
    }
}
