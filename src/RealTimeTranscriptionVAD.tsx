import React, { useState } from "react";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import axios from "axios";

const RealTimeTranscriptionVAD: React.FC = () => {
  const [audioList, setAudioList] = useState<string[]>([]); // Store audio clips
  const [transcription, setTranscription] = useState<string[]>([]); // Store transcribed text

  // Initialize VAD
  const vad = useMicVAD({
    onSpeechEnd: (audio) => {
      console.log("Speech detected, processing audio...");

      // Convert audio to WAV and store it
      const wavBuffer = utils.encodeWAV(audio);
      const base64 = utils.arrayBufferToBase64(wavBuffer);
      const audioURL = `data:audio/wav;base64,${base64}`;
      setAudioList((prev) => [audioURL, ...prev]);

      // Send audio to API for transcription
      sendAudioForTranscription(wavBuffer);
    },
  });

  // Send audio to the API for transcription
  const sendAudioForTranscription = async (audioBuffer: ArrayBuffer) => {
    const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "adminbr/whisper-small-pt-ct2");
    formData.append("language", "pt");
    formData.append("response_format", "json");

    try {
      const response = await axios.post(
        "http://localhost:8000/v1/audio/transcriptions",
        formData
      );
      setTranscription((prev) => [...prev, response.data.text]);
    } catch (error) {
      console.error("Error transcribing audio:", error);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        Real-Time Transcription with VAD
      </h1>

      {/* VAD Controls */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">VAD Controls</h2>
        <button
          onClick={vad.start}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2 hover:bg-blue-600"
        >
          Start
        </button>
        <button
          onClick={vad.pause}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Pause
        </button>
      </div>

      {/* VAD State */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">VAD State</h2>
        <p>
          Listening:{" "}
          <span className="font-bold">{vad.listening.toString()}</span>
        </p>
        <p>
          User Speaking:{" "}
          <span className="font-bold">{vad.userSpeaking.toString()}</span>
        </p>
      </div>

      {/* Audio Clips */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Audio Clips</h2>
        <div className="space-y-2">
          {audioList.map((audioURL, index) => (
            <div key={index} className="flex items-center">
              <audio controls src={audioURL} className="mr-2" />
              <p className="text-sm text-gray-600">
                Clip {audioList.length - index}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Transcription */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Transcription</h2>
        <div className="bg-gray-100 p-4 rounded">
          {transcription.map((text, index) => (
            <p key={index} className="mb-2">
              {text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RealTimeTranscriptionVAD;
