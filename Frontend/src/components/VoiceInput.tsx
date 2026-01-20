/**
 * VoiceInput Component - Copec EV Assistant
 * Voice recording and transcription (with mock fallback)
 */

import { useState, useRef } from 'react';
import { Icon } from './Icon';

interface VoiceInputProps {
    onResult: (transcript: string) => void;
}

export default function VoiceInput({ onResult }: VoiceInputProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    // Check if Web Speech API is available
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

    const startRecording = async () => {
        // Try native Web Speech API first
        if (hasSpeechRecognition) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const SpeechRecognitionAPI = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recognition: any = new SpeechRecognitionAPI();

            recognition.lang = 'es-CL';
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onstart = () => {
                setIsRecording(true);
                setTranscript('');
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onresult = (event: any) => {
                const result = event.results[0][0].transcript;
                setTranscript(result);
                setIsRecording(false);
                onResult(result);

                // Read response (text-to-speech)
                speakResponse(`Buscando estaciones de carga cercanas a tu ubicación.`);
            };

            recognition.onerror = () => {
                setIsRecording(false);
                // Fallback to mock
                mockRecording();
            };

            recognition.onend = () => {
                setIsRecording(false);
            };

            recognition.start();
            return;
        }

        // Fallback to MediaRecorder for audio recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                // Would send to transcription API here
                // For demo, use mock
                mockTranscription();
            };

            mediaRecorder.start();
            setIsRecording(true);
            setTranscript('');

            // Auto-stop after 5 seconds
            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    stopRecording();
                }
            }, 5000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            mockRecording();
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const mockRecording = () => {
        setIsRecording(true);
        setTranscript('');

        // Simulate recording for 2 seconds
        setTimeout(() => {
            setIsRecording(false);
            mockTranscription();
        }, 2000);
    };

    const mockTranscription = () => {
        setIsProcessing(true);

        // Mock transcriptions for demo
        const mockPhrases = [
            'Necesito una estación de carga cerca',
            'Buscar cargador rápido',
            '¿Dónde puedo cargar mi auto?',
            'Estación con WiFi y café'
        ];

        setTimeout(() => {
            const mockResult = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
            setTranscript(mockResult);
            setIsProcessing(false);
            onResult(mockResult);

            speakResponse('Encontré varias estaciones cerca de ti. Mostrando las mejores opciones.');
        }, 1000);
    };

    const speakResponse = (text: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 1;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
        }
    };

    const handleClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        <div className="voice-input">
            <button
                className={`voice-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
                onClick={handleClick}
                disabled={isProcessing}
                title={isRecording ? 'Detener grabación' : 'Hablar'}
            >
                {isProcessing ? (
                    <span className="processing-icon" aria-hidden>
                        <Icon name="clock" size={16} />
                    </span>
                ) : isRecording ? (
                    <span className="recording-icon" aria-hidden>
                        <Icon name="stop" size={16} />
                    </span>
                ) : (
                    <span className="mic-icon" aria-hidden>
                        <Icon name="mic" size={16} />
                    </span>
                )}
            </button>

            {(isRecording || transcript) && (
                <div className="voice-feedback">
                    {isRecording && (
                        <div className="recording-indicator">
                            <span className="pulse"></span>
                            <span>Escuchando...</span>
                        </div>
                    )}
                    {transcript && !isRecording && (
                        <div className="transcript">
                            "{transcript}"
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
