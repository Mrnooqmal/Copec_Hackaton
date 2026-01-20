/**
 * AIChat Component - Copec EV Assistant
 * Conversational AI interface
 */

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Loader2, Zap, MapPin, Route } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    actions?: Action[];
}

interface Action {
    type: string;
    stations?: string[];
}

interface AIChatProps {
    isOpen: boolean;
    onClose: () => void;
    userContext?: {
        batteryLevel?: number;
        location?: { lat: number; lng: number };
        urgency?: string;
    };
    onAction?: (action: Action) => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AIChat({ isOpen, onClose, userContext, onAction }: AIChatProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: 'Hola, soy tu asistente de electromovilidad Copec. ¿En qué puedo ayudarte? Puedo encontrar estaciones cercanas, planificar viajes, o responder tus dudas sobre carga de vehículos eléctricos.',
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    conversationHistory: messages.slice(-6).map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    userContext
                })
            });

            if (response.ok) {
                const data = await response.json();
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.message,
                    timestamp: new Date(),
                    actions: data.actions
                };
                setMessages(prev => [...prev, assistantMessage]);

                // Handle actions
                if (data.actions && onAction) {
                    data.actions.forEach((action: Action) => onAction(action));
                }
            } else {
                // Fallback response
                const fallbackMessage: Message = {
                    role: 'assistant',
                    content: getFallbackResponse(userMessage.content),
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, fallbackMessage]);
            }
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: 'Disculpa, hubo un problema de conexión. ¿Puedes intentar de nuevo?',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const getFallbackResponse = (userInput: string): string => {
        const lower = userInput.toLowerCase();

        if (lower.includes('hola') || lower.includes('buenos')) {
            return '¡Hola! Estoy aquí para ayudarte con la carga de tu vehículo eléctrico. ¿Buscas una estación cercana o quieres planificar un viaje?';
        }
        if (lower.includes('cerca') || lower.includes('dónde')) {
            return 'Las estaciones Copec más cercanas al centro de Santiago son Copec Alameda (con cargadores rápidos 150kW) y Copec Providencia (con Street Burger). ¿Te muestro más detalles?';
        }
        if (lower.includes('viaje') || lower.includes('ruta')) {
            return 'Para planificar tu viaje, necesito saber tu destino y nivel de batería. Puedo calcular las paradas óptimas de carga en la ruta. ¿A dónde te diriges?';
        }
        if (lower.includes('precio') || lower.includes('costo')) {
            return 'Los precios Copec son: Carga rápida $200/kWh y carga lenta $120/kWh. Una carga típica de 30kWh te costaría entre $3.600 y $6.000 CLP.';
        }
        return 'Entiendo. ¿Te gustaría que te ayude a encontrar una estación de carga o a planificar un viaje?';
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const quickActions = [
        { label: 'Estaciones cercanas', icon: <MapPin size={12} />, query: '¿Cuáles son las estaciones más cercanas?' },
        { label: 'Planificar viaje', icon: <Route size={12} />, query: 'Quiero planificar un viaje a Valparaíso' },
        { label: 'Carga rápida', icon: <Zap size={12} />, query: 'Necesito una estación con carga rápida urgente' }
    ];

    if (!isOpen) return null;

    return (
        <div className="ai-chat-overlay">
            <div className="ai-chat">
                <div className="chat-header">
                    <div className="chat-title">
                        <MessageSquare size={18} />
                        <span>Asistente Copec</span>
                    </div>
                    <button className="close-chat" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="chat-messages">
                    {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.role}`}>
                            <div className="message-content">
                                {msg.content}
                            </div>
                            {msg.actions && msg.actions.length > 0 && (
                                <div className="message-actions">
                                    {msg.actions.map((action, i) => (
                                        <button
                                            key={i}
                                            className="action-chip"
                                            onClick={() => onAction && onAction(action)}
                                        >
                                            {action.type === 'show_stations' && <><MapPin size={12} /> Ver estaciones</>}
                                            {action.type === 'open_trip_planner' && <><Route size={12} /> Planificar</>}
                                            {action.type === 'suggest_navigation' && <><MapPin size={12} /> Navegar</>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div className="message assistant">
                            <div className="message-content loading">
                                <Loader2 size={16} className="spin" />
                                <span>Pensando...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Actions */}
                {messages.length <= 2 && (
                    <div className="quick-actions">
                        {quickActions.map((action, index) => (
                            <button
                                key={index}
                                className="quick-action"
                                onClick={() => {
                                    setInput(action.query);
                                    setTimeout(handleSend, 100);
                                }}
                            >
                                {action.icon} {action.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="chat-input">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Escribe tu mensaje..."
                        disabled={loading}
                    />
                    <button
                        className="send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
