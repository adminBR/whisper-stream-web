import React, { useState, useRef } from "react";
import { Mic, MicOff, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TranscriptionResponse {
  text: string;
}

const VAD_THRESHOLD = -45;
const SILENCE_DURATION = 1000;

const TranscriptionApp: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [status, setStatus] = useState<
    "idle" | "recording" | "transcribing" | "error"
  >("idle");
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const dataArray = useRef<Float32Array | null>(null);
  const silenceStart = useRef<number | null>(null);
  const currentChunks = useRef<Blob[]>([]);

  const detectSilence = (): void => {
    if (!analyser.current || !dataArray.current) return;

    analyser.current.getFloatTimeDomainData(dataArray.current);
    const rms = Math.sqrt(
      dataArray.current.reduce((sum, val) => sum + val * val, 0) /
        dataArray.current.length
    );
    const db = 20 * Math.log10(rms);

    if (db < VAD_THRESHOLD) {
      if (!silenceStart.current) {
        silenceStart.current = Date.now();
      } else if (
        Date.now() - silenceStart.current > SILENCE_DURATION &&
        currentChunks.current.length > 0
      ) {
        mediaRecorder.current?.stop();
        currentChunks.current = [];
      }
    } else {
      silenceStart.current = null;
    }
  };

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new AudioContext();
      analyser.current = audioContext.current.createAnalyser();
      const source = audioContext.current.createMediaStreamSource(stream);
      source.connect(analyser.current);

      analyser.current.fftSize = 1024;
      dataArray.current = new Float32Array(analyser.current.fftSize);

      mediaRecorder.current = new MediaRecorder(stream);

      mediaRecorder.current.ondataavailable = (e: BlobEvent) => {
        currentChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(currentChunks.current, {
          type: "audio/wav",
        });
        setAudioChunks((prev) => [...prev, audioBlob]);

        setStatus("transcribing");
        const formData = new FormData();
        formData.append("file", audioBlob);
        formData.append("model", "adminbr/whisper-small-pt-ct2");
        formData.append("language", "pt");
        formData.append("response_format", "json");

        try {
          const response = await fetch(
            "http://localhost:8000/v1/audio/transcriptions",
            {
              method: "POST",
              body: formData,
            }
          );
          const data: TranscriptionResponse = await response.json();
          setTranscriptions((prev) => [...prev, data.text]);
        } catch (error) {
          console.error("Transcription error:", error);
        }

        setStatus("recording");
        mediaRecorder.current?.start();
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setStatus("recording");

      const checkSilence = () => {
        if (isRecording) {
          detectSilence();
          requestAnimationFrame(checkSilence);
        }
      };
      checkSilence();
    } catch (err) {
      console.error("Failed to start recording:", err);
      setStatus("error");
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach((track) => track.stop());
      audioContext.current?.close();
      setIsRecording(false);
      setStatus("idle");
    }
  };

  const saveAudio = (): void => {
    if (audioChunks.length === 0) return;

    const fullAudio = new Blob(audioChunks, { type: "audio/wav" });
    const url = URL.createObjectURL(fullAudio);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcription-${new Date().toISOString()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (): string => {
    switch (status) {
      case "recording":
        return "bg-red-500";
      case "transcribing":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto p-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Live Transcription</span>
          <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
          >
            {isRecording ? (
              <MicOff className="mr-2" />
            ) : (
              <Mic className="mr-2" />
            )}
            {isRecording ? "Stop Recording" : "Start Recording"}
          </Button>
          <Button
            onClick={saveAudio}
            disabled={audioChunks.length === 0}
            variant="outline"
          >
            <Save className="mr-2" />
            Save Audio
          </Button>
        </div>

        {status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to access microphone. Please check your permissions.
            </AlertDescription>
          </Alert>
        )}

        <div className="h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg">
          {transcriptions.map((text, idx) => (
            <p key={idx} className="mb-2">
              {text}
            </p>
          ))}
          {status === "transcribing" && (
            <p className="text-gray-500 italic">Processing...</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TranscriptionApp;
