package il.kesher.ptt

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import kotlin.concurrent.thread

class AudioEngine {
    private val sampleRate = 16000
    private var recording = false
    private var recordThread: Thread? = null
    private var track: AudioTrack? = null

    fun startPlayback() {
        if (track != null) return
        val min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(min * 2)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track?.play()
    }

    fun play(pcm: ByteArray) {
        startPlayback()
        track?.write(pcm, 0, pcm.size)
    }

    fun startCapture(onFrame: (ByteArray) -> Unit) {
        if (recording) return
        recording = true
        val min = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            min * 2
        )
        recorder.startRecording()
        recordThread = thread(start = true) {
            val buf = ByteArray(2048)
            while (recording) {
                val n = recorder.read(buf, 0, buf.size)
                if (n > 0) onFrame(buf.copyOf(n))
            }
            recorder.stop()
            recorder.release()
        }
    }

    fun stopCapture() {
        recording = false
        recordThread = null
    }

    fun release() {
        stopCapture()
        track?.stop()
        track?.release()
        track = null
    }
}
