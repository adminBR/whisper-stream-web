import React, { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Upload, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const AudioTranscription = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const silenceTimeout = useRef<NodeJS.Timeout | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioQueue = useRef<Blob[]>([]);

  const SILENCE_THRESHOLD = -50;
  const SILENCE_DURATION = 1000;

  useEffect(() => {
    const checkBrowserSupport = async () => {
      try {
        // Check if we're in a secure context
        if (
          window.location.protocol !== "https:" &&
          window.location.hostname !== "localhost"
        ) {
          throw new Error(
            "Audio recording requires a secure connection (HTTPS) unless running on localhost"
          );
        }

        // Verify MediaDevices API
        if (!navigator.mediaDevices) {
          throw new Error("MediaDevices API not available");
        }

        // Try to get audio permissions
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            // Stop the stream immediately after testing
            stream.getTracks().forEach((track) => track.stop());
            setIsSupported(true);
          })
          .catch((err) => {
            throw new Error("Microphone access denied or not available");
          });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Browser not supported");
        setIsSupported(false);
      }
    };

    checkBrowserSupport();
  }, []);

  // Rest of the component remains the same...
  const processAudioChunk = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("file", blob, "audio.wav");
    formData.append("model", "adminbr/whisper-small-pt-ct2");
    formData.append("language", "pt");
    formData.append("response_format", "json");

    try {
      const response = await fetch(
        "http://192.168.1.64:8000/v1/audio/transcriptions",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.text) {
        setTranscription((prev) => prev + " " + data.text);
      }
    } catch (error) {
      setError(
        `Error processing audio: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      stopRecording();
    }
  };

  const setupVAD = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext.current = new AudioContextClass();

    const source = audioContext.current.createMediaStreamSource(stream);
    const analyser = audioContext.current.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(analyser);

    const checkAudioLevel = () => {
      if (!isRecording) return;

      const dataArray = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(dataArray);

      let rms = 0;
      for (let i = 0; i < dataArray.length; i++) {
        rms += dataArray[i] * dataArray[i];
      }
      rms = Math.sqrt(rms / dataArray.length);
      const db = 20 * Math.log10(rms);

      if (db < SILENCE_THRESHOLD) {
        if (!silenceTimeout.current) {
          silenceTimeout.current = setTimeout(() => {
            if (audioQueue.current.length > 0) {
              const audioBlob = new Blob(audioQueue.current, {
                type: "audio/wav",
              });
              processAudioChunk(audioBlob);
              audioQueue.current = [];
            }
          }, SILENCE_DURATION);
        }
      } else {
        if (silenceTimeout.current) {
          clearTimeout(silenceTimeout.current);
          silenceTimeout.current = null;
        }
      }

      requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  };

  const startRecording = async () => {
    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      mediaRecorder.current = new MediaRecorder(stream);
      setupVAD(stream);

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioQueue.current.push(event.data);
        }
      };

      mediaRecorder.current.onerror = (event) => {
        const error = event as any;
        setError("Recording error: " + error.error.message);
        stopRecording();
      };

      mediaRecorder.current.start(1000);
      setIsRecording(true);
    } catch (error) {
      setError(
        `Microphone access error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (audioContext.current) {
      audioContext.current.close();
    }
    setIsRecording(false);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      setAudioFile(file);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", "adminbr/whisper-small-pt-ct2");
      formData.append("language", "pt");
      formData.append("response_format", "json");

      try {
        const response = await fetch(
          "http://192.168.1.64:8000/v1/audio/transcriptions",
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.text) {
          setTranscription(data.text);
        }
      } catch (error) {
        setError(
          `Error processing audio file: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  };

  if (!isSupported) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Browser Not Supported</span>
          </div>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="flex gap-4 justify-center">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            isRecording
              ? "bg-red-500 hover:bg-red-600"
              : "bg-blue-500 hover:bg-blue-600"
          } text-white transition-colors`}
          disabled={!isSupported}
        >
          {isRecording ? (
            <>
              <Square className="w-5 h-5" />
              Stop Recording
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              Start Recording
            </>
          )}
        </button>

        <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white cursor-pointer transition-colors">
          <Upload className="w-5 h-5" />
          Upload Audio File
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {audioFile && (
        <div className="text-sm text-gray-600">
          Selected file: {audioFile.name}
        </div>
      )}

      <div className="bg-gray-100 rounded-lg p-4 min-h-[200px] whitespace-pre-wrap">
        {transcription || "Transcription will appear here..."}
      </div>
    </div>
  );
};

export default AudioTranscription;
