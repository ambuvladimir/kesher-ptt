package il.kesher.ptt

import android.media.AudioManager
import android.media.ToneGenerator

object RadioTones {
    private val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80)

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
}
