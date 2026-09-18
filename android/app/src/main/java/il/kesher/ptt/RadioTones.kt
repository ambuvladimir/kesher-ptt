package il.kesher.ptt

import android.media.AudioManager
import android.media.ToneGenerator
import kotlin.concurrent.thread

object RadioTones {
    private val tg = ToneGenerator(AudioManager.STREAM_MUSIC, 95)
    @Volatile private var ringing = false
    private var ringThread: Thread? = null

    fun start() {
        tg.startTone(ToneGenerator.TONE_CDMA_PIP, 180)
    }

    fun end() {
        tg.startTone(ToneGenerator.TONE_PROP_ACK, 220)
    }

    fun error() {
        tg.startTone(ToneGenerator.TONE_SUP_BUSY, 450)
    }

    fun emergency() {
        tg.startTone(ToneGenerator.TONE_CDMA_EMERGENCY_RINGBACK, 900)
    }

    fun incoming(loop: Boolean = false) {
        stopIncoming()
        ringing = true
        ringThread = thread(name = "ptt-ring", start = true) {
            val ring = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            try {
                val times = if (loop) 8 else 3
                repeat(times) {
                    if (!ringing) return@repeat
                    ring.startTone(ToneGenerator.TONE_SUP_RINGTONE, 1100)
                    Thread.sleep(if (loop) 1600 else 1300)
                }
            } catch (_: Exception) {
            } finally {
                try {
                    ring.release()
                } catch (_: Exception) {
                }
            }
        }
    }

    fun stopIncoming() {
        ringing = false
        try {
            tg.stopTone()
        } catch (_: Exception) {
        }
    }
}
