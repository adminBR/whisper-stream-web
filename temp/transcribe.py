import pyaudio
import webrtcvad
import wave
import requests
import json
from array import array
from io import BytesIO
import time

class LiveTranscriber:
    def __init__(self, sample_rate=16000, chunk_size=480):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.vad = webrtcvad.Vad(3)  # Aggressiveness level 3
        self.audio = pyaudio.PyAudio()
        self.chunks = []
        self.is_speaking = False
        self.silence_frames = 0
        self.max_silence_frames = 30  # Adjust for desired pause length

    def save_chunk_to_wav(self, chunks):
        with BytesIO() as wav_buffer:
            with wave.open(wav_buffer, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(self.sample_rate)
                wav.writeframes(b''.join(chunks))
            return wav_buffer.getvalue()

    def transcribe_chunk(self, audio_data):
        files = {
            'file': ('chunk.wav', audio_data, 'audio/wav')
        }
        data = {
            'model': 'adminbr/whisper-small-pt-ct2',
            'language': 'pt',
            'response_format': 'json'
        }
        response = requests.post(
            'http://192.168.1.64:8000/v1/audio/transcriptions',
            files=files,
            data=data
        )
        return response.json()['text']

    def process_audio(self):
        stream = self.audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk_size
        )

        print("Starting transcription... (Press Ctrl+C to stop)")
        
        try:
            while True:
                audio_chunk = array('h', stream.read(self.chunk_size))
                is_speech = self.vad.is_speech(audio_chunk.tobytes(), self.sample_rate)

                if is_speech:
                    self.is_speaking = True
                    self.silence_frames = 0
                    self.chunks.append(audio_chunk.tobytes())
                elif self.is_speaking:
                    self.silence_frames += 1
                    self.chunks.append(audio_chunk.tobytes())

                    if self.silence_frames >= self.max_silence_frames:
                        if len(self.chunks) > 0:
                            wav_data = self.save_chunk_to_wav(self.chunks)
                            transcription = self.transcribe_chunk(wav_data)
                            print(f"Transcription: {transcription}")
                            
                        self.chunks = []
                        self.is_speaking = False
                        self.silence_frames = 0

        except KeyboardInterrupt:
            stream.stop_stream()
            stream.close()
            self.audio.terminate()

if __name__ == "__main__":
    transcriber = LiveTranscriber()
    transcriber.process_audio()