# Copec EV Assistant (adhoc)

**Hackathon MVP - Copec + AWS Bedrock | Electromovilidad**

Sistema de optimización de cargadores eléctricos con recomendaciones inteligentes usando AWS Bedrock.

![Copec EV](https://img.shields.io/badge/Copec-EV%20Assistant-146CFD?style=for-the-badge)

---

## 🚀 Quick Start

### Backend (Lambda + Serverless)

```bash
cd Backend

# Instalar dependencias
npm install

# Ejecutar localmente
npx serverless offline

# Deploy a AWS
npx serverless deploy --stage dev
```

**Endpoints disponibles:**
- `POST /api/recommend` - Obtener recomendaciones de estaciones
- `GET /api/stations/nearby?lat=-33.45&lng=-70.66&radius=10` - Estaciones cercanas
- `POST /api/voice/process` - Procesar entrada de voz

### Frontend (React + Vite)

```bash
cd Frontend

# Instalar dependencias
npm install

# Ejecutar dev server
npm run dev

# Build producción
npm run build
```

**Variables de entorno (opcional):**
```env
VITE_API_URL=https://tu-api-gateway-url.amazonaws.com
```

---

## ⏱️ Checklist Hora por Hora (H1-H6)

### H1: Setup & Data (0:00-1:00)
- [x] Clonar repo y revisar estructura
- [x] Crear `stations_geo.json` con 12 estaciones Santiago
- [x] Configurar `serverless.yml` con nuevos endpoints
- [ ] Verificar permisos Bedrock en AWS

### H2: Backend Lambda (1:00-2:00)
- [x] Implementar `ev-optimizer.js` con Bedrock SDK
- [x] Scoring algorithm (distancia, disponibilidad, urgencia)
- [ ] Probar endpoints localmente con `serverless offline`
- [ ] Fix bugs si hay

### H3: Frontend Base (2:00-3:00)
- [x] Instalar Leaflet y dependencias
- [x] Crear `StationMap.tsx` con marcadores
- [x] Integrar paleta Copec (#146CFD, #344285)
- [ ] Probar mapa con datos locales

### H4: Componentes UI (3:00-4:00)
- [x] Crear `StationCard.tsx` con detalles
- [x] Crear `VoiceInput.tsx` (mock o real)
- [x] Estilos responsivos
- [ ] Integrar panel de recomendaciones

### H5: Integración (4:00-5:00)
- [ ] Conectar frontend con API backend
- [ ] Probar flujo completo: ubicación → recomendación → navegación
- [ ] Ajustar prompts de Bedrock
- [ ] Testing end-to-end

### H6: Demo & Polish (5:00-6:00)
- [ ] Preparar 3 escenarios demo
- [ ] Grabar video demo (opcional)
- [ ] Revisar código y limpiar
- [ ] Preparar presentación

---

## 🎭 Escenarios de Demo

### Escenario 1: Usuario con Batería Baja + Urgencia Alta
**Contexto:** Conductor con 15% batería, necesita cargar urgente.

**Pasos:**
1. Abrir app → click "📍" para ubicación
2. Mover slider batería a 15%
3. Seleccionar urgencia "🚀 Alta"
4. Click "Recomendar estación"
5. Sistema muestra estación más cercana con cargador rápido disponible
6. Click "Navegar" para abrir Google Maps

**Resultado esperado:** Recomendación prioriza distancia y disponibilidad de cargador rápido.

---

### Escenario 2: Usuario con Tiempo Flexible
**Contexto:** Usuario con 40% batería, busca cargar económico con café.

**Pasos:**
1. Ubicación en Providencia
2. Batería 40%, urgencia "🐢 Baja"
3. Click en estación con amenities (café ☕)
4. Ver tarjeta de detalles
5. Click "Recomendar para mí"

**Resultado esperado:** Prioriza estaciones con cargador lento (más barato) y buenos servicios.

---

### Escenario 3: Comando de Voz
**Contexto:** Usuario maneja y necesita buscar por voz.

**Pasos:**
1. Click botón micrófono 🎤
2. Decir: "Necesito una estación de carga cerca"
3. Sistema transcribe y busca automáticamente
4. Respuesta de voz: "Encontré varias estaciones cerca de ti"
5. Panel de recomendaciones aparece

**Resultado esperado:** Flujo hands-free desde voz hasta recomendación.

---

## 🛠️ Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   API Gateway   │────▶│   Lambda        │
│   React+Vite    │     │   /api/*        │     │   ev-optimizer  │
│   Leaflet Map   │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   stations.json │     │   AWS Bedrock   │
                        │   (S3/local)    │     │   Claude 3      │
                        └─────────────────┘     └─────────────────┘
```

---

## 📁 Estructura de Archivos

```
Copec_Hackaton/
├── Backend/
│   ├── data/
│   │   └── stations_geo.json      # 12 estaciones Santiago
│   ├── handlers/
│   │   └── ev-optimizer.js        # Lambda con Bedrock
│   └── serverless.yml             # Configuración AWS
│
├── Frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── StationMap.tsx     # Mapa principal
│   │   │   ├── StationCard.tsx    # Tarjeta estación
│   │   │   └── VoiceInput.tsx     # Entrada voz
│   │   ├── data/
│   │   │   └── stations_geo.json  # Datos locales
│   │   ├── App.tsx                # Componente raíz
│   │   └── App.css                # Estilos Copec
│   └── package.json
│
└── README.md
```

---

## 🎨 Paleta Copec

| Color | Hex | Uso |
|-------|-----|-----|
| Azul Principal | `#146CFD` | Headers, CTAs, links |
| Azul Secundario | `#344285` | Textos destacados, gradientes |
| Blanco | `#FFFFFF` | Fondos, textos sobre azul |
| Gris Neutro | `#6B6B6B` | Textos secundarios |
| Verde | `#22C55E` | Disponible |
| Rojo | `#EF4444` | Ocupado |
| Amarillo | `#F59E0B` | Mantenimiento |

---

## 🔧 Troubleshooting

**Error: Bedrock access denied**
```bash
# Verificar que el modelo está habilitado en tu región
aws bedrock list-foundation-models --region us-east-1
```

**Error: CORS en frontend**
- Verificar que `serverless.yml` tiene CORS habilitado
- Usar `VITE_API_URL` con la URL correcta

**Mapa no carga**
- Verificar Leaflet CSS importado
- Revisar consola del navegador

---

## 📄 License

MIT - Hackathon Copec + AWS Bedrock 2026
