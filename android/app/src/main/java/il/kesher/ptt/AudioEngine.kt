package il.kesher.ptt

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import java.util.ArrayDeque
import kotlin.concurrent.thread

class AudioEngine {
    companion object {
        const val SAMPLE_RATE = 24000
        private const val FRAME_BYTES = 1920 // 40 ms at 24 kHz 16-bit mono
        private const val PREROLL_BYTES = SAMPLE_RATE * 2 * 80 / 1000 // 80 ms
        private const val MAX_BUFFERED = SAMPLE_RATE * 2 * 400 / 1000 // 400 ms
    }

    private var recording = false
    private var recordThread: Thread? = null
    @Volatile private var playRunning = false
    private var playThread: Thread? = null
    private var track: AudioTrack? = null
    private val queue = ArrayDeque<ByteArray>()
    private val lock = Object()
    private var buffered = 0
    @Volatile private var started = false

    fun startPlayback() {
        if (track != null) return
        val min = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val size = (min * 4).coerceAtLeast(PREROLL_BYTES * 2)
        val builder = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(size)
            .setTransferMode(AudioTrack.MODE_STREAM)
        try {
            builder.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
        } catch (_: Exception) {
        }
        track = builder.build()
        track?.play()
        playRunning = true
        playThread = thread(name = "ptt-play", start = true) {
            while (playRunning) {
                val chunk: ByteArray? = synchronized(lock) {
                    if (!started && buffered < PREROLL_BYTES) {
                        lock.wait(40)
                        return@synchronized null
                    }
                    if (queue.isEmpty()) {
                        started = false
                        lock.wait(40)
                        return@synchronized null
                    }
                    started = true
                    val c = queue.removeFirst()
                    buffered -= c.size
                    c
                }
                if (!playRunning) break
                if (chunk == null) continue
                var off = 0
                while (off < chunk.size && playRunning) {
                    val n = track?.write(chunk, off, chunk.size - off) ?: 0
                    if (n <= 0) break
                    off += n
                }
            }
        }
    }

    fun play(pcm: ByteArray) {
        if (pcm.size < 4) return
        startPlayback()
        synchronized(lock) {
            queue.addLast(pcm)
            buffered += pcm.size
            while (buffered > MAX_BUFFERED && queue.size > 1) {
                buffered -= queue.removeFirst().size
            }
            lock.notifyAll()
        }
    }

    fun resetPlayback() {
        synchronized(lock) {
            queue.clear()
            buffered = 0
            started = false
            lock.notifyAll()
        }
    }

    fun startCapture(onFrame: (ByteArray) -> Unit) {
        if (recording) return
        recording = true
        val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            (min * 2).coerceAtLeast(FRAME_BYTES * 4)
        )
        recorder.startRecording()
        recordThread = thread(name = "ptt-cap", start = true) {
            val buf = ByteArray(FRAME_BYTES)
            while (recording) {
                val n = recorder.read(buf, 0, buf.size)
                if (n > 0) onFrame(buf.copyOf(n))
            }
            try {
                recorder.stop()
            } catch (_: Exception) {
            }
            recorder.release()
        }
    }

    fun stopCapture() {
        recording = false
        recordThread = null
    }

    fun release() {
        stopCapture()
        playRunning = false
        synchronized(lock) { lock.notifyAll() }
        try {
            playThread?.join(200)
        } catch (_: Exception) {
        }
        playThread = null
        track?.stop()
        track?.release()
        track = null
        resetPlayback()
    }
}
