# Contexto tecnico vigente

Fecha de corte: 2026-05-30.

Este documento es el relevo tecnico para continuar el proyecto o iniciar una version nueva sin depender de conversaciones anteriores. Describe el codigo actual. Twilio fue retirado del flujo activo y Kapso es el proveedor de WhatsApp.

## Objetivo

Construir un asesor conversacional de WhatsApp para una tienda de mascotas. Debe comprender como escribe realmente un cliente, ayudar a cotizar o comprar, recomendar productos y completar un pedido sin sonar como un formulario rigido.

La autonomia tiene un limite deliberado:

- OpenAI interpreta intencion, contexto, errores de escritura, razas, abreviaturas e imagenes.
- El backend decide si un producto existe y valida marcas, referencias, presentaciones, precios y cambios del carrito.
- Supabase conserva estado, historial, pedidos y ejemplos curados.

## Arquitectura actual

```mermaid
flowchart TD
  A["Cliente autorizado"] --> B["Kapso sandbox WhatsApp"]
  B --> C["POST /webhooks/kapso/whatsapp"]
  C --> D["kapsoMessagingProvider"]
  C --> E["conversationService"]
  E --> F["conversationStore"]
  F --> G{"Supabase configurado?"}
  G -->|si| H["Supabase REST"]
  G -->|no| I["Memoria local"]
  E --> J["mediaProcessor"]
  J --> K["OpenAI Whisper"]
  E --> L["aiInterpreter OpenAI"]
  E --> M["conversationEngine"]
  M --> N["productos.json"]
  E --> O["humanizer OpenAI"]
  E --> P["responseGuard"]
  E --> D
  D --> B
```

### Separacion por capas

| Archivo | Responsabilidad |
| --- | --- |
| `src/app.js` | Rutas HTTP, firma del webhook, respuesta rapida e idempotencia basica. |
| `src/providers/kapsoMessagingProvider.js` | Entrada y salida especificas de Kapso. Normaliza JSON, multimedia y envio de texto. |
| `src/services/conversationService.js` | Orquesta multimedia, estado, ejemplos, OpenAI, motor comercial y persistencia. |
| `src/services/mediaProcessor.js` | Entrega URL de imagen a vision y transcribe audio cuando hace falta. |
| `src/services/aiInterpreter.js` | Convierte lenguaje libre en JSON estructurado para el motor. |
| `src/conversation/conversationEngine.js` | Valida catalogo y aplica operaciones reales sobre carrito, entrega y pago. |
| `src/services/humanizer.js` | Convierte la respuesta operativa en texto natural sin cambiar hechos. |
| `src/services/responseGuard.js` | Ultima barrera ante afirmaciones de presentaciones inexistentes. |
| `src/conversation/conversationStore.js` | Estado conversacional en memoria y persistencia delegada a Supabase. |
| `src/repositories/*` | Catalogo, conversaciones, pedidos y ejemplos curados. |

Para cambiar de proveedor de mensajeria, crea otro adaptador equivalente a `kapsoMessagingProvider.js` y cambia la importacion del provider en `src/app.js`. El resto del flujo no debe conocer detalles del proveedor.

## Flujo de un mensaje

1. Kapso envia un evento `whatsapp.message.received`.
2. `src/app.js` valida `x-webhook-signature` contra el cuerpo HTTP crudo, extrae eventos y responde HTTP `200 OK` inmediatamente.
3. El provider normaliza cliente, destinatario, texto, `phone_number_id`, idempotencia y multimedia.
4. La app agrupa los mensajes consecutivos del mismo cliente y reinicia una espera corta con cada entrada para procesar un solo lote.
5. `conversationService` carga el estado y el historial reciente del usuario desde Supabase antes de llamar a OpenAI.
6. Si hay audio, reutiliza la transcripcion de Kapso o descarga el archivo y lo envia a Whisper.
7. Si hay imagen, pasa la URL publica al interprete OpenAI con capacidades de vision.
8. El interprete devuelve JSON con intencion, accion, productos, entrega, datos del cliente y operacion de carrito.
9. `conversationEngine` valida contra `productos.json` y modifica el estado solamente cuando corresponde.
10. `humanizer` mejora el tono sin alterar precios, pesos, cantidades ni acciones.
11. `responseGuard` bloquea una afirmacion incompatible con el catalogo.
12. El estado, el historial y un pedido confirmado se guardan en Supabase cuando esta configurado.
13. El provider envia la respuesta por Kapso.

## Mejoras ya implementadas

### Criterio comercial

- Una consulta de precio no agrega productos al carrito.
- Una cotizacion puede incluir uno o varios productos.
- Los productos cotizados quedan en `productosConsultados` para entender frases posteriores como `agrega los dos` o `dejame el primero`.
- Un cliente puede pedir varios productos en el mismo mensaje, incluso en varias lineas.
- Una presentacion inexistente produce una negativa util con opciones reales.
- `asi esta bien` avanza al siguiente paso si el carrito ya esta definido; no repite presentaciones.
- El resumen final solicita confirmacion explicita. El humanizador no puede declarar despacho ni confirmacion antes del `si` del cliente.
- Respuestas afirmativas como `perfecto` confirman el resumen final. Si el cliente acepta reutilizar direccion y datos completos de un pedido anterior, no se solicita una confirmacion adicional.
- El ultimo pedido confirmado se conserva como memoria historica separada.
- Un saludo posterior permite ofrecer repetir productos y direccion del ultimo pedido.
- Si el cliente menciona un producto nuevo, el carrito anterior no se mezcla; solo se reutilizan los datos de entrega que no cambien.

### Comprension del cliente

- Tolera abreviaturas como `a.r.p`, `a.r.g`, `cach`, `kl` y errores leves de marca.
- OpenAI puede inferir especie, etapa y tamano desde una raza sin una tabla programada raza por raza.
- Distingue direccion completa de sector o referencia parcial.
- Conserva el hilo si el cliente envia aclaraciones cortas.
- Usa el estado pendiente para interpretar confirmaciones breves con errores ortograficos sin reemplazar datos del cliente.

### Multimedia

- Imagen: Kapso debe entregar una URL real; el backend descarga el archivo y OpenAI recibe `image_url` como data URL/base64 junto con el caption si existe.
- Audio/nota de voz: si hay URL, el backend descarga el archivo y lo envia a OpenAI Whisper.
- `message.kapso.transcript.text` solo se usa como respaldo cuando no hay URL descargable; en ese caso se deja warning porque OpenAI no recibio el audio real.
- La descarga multimedia valida URL publica y aplica timeout y limite de bytes configurables.

### Seguridad y resiliencia inicial

- Firma HMAC SHA-256 sobre el cuerpo HTTP crudo para webhooks Kapso.
- Firma obligatoria en `NODE_ENV=production`.
- Dedupe basico en memoria mediante `x-idempotency-key`.
- Cola en memoria por cliente para mantener el orden de mensajes consecutivos.
- Respuesta HTTP rapida para evitar que el webhook espere el procesamiento completo.
- Fallback a memoria local si Supabase no esta configurado.
- Fallback a respuesta operativa si OpenAI falla.

## Catalogo

La fuente de verdad vive en `productos.json`. Actualmente contiene:

- Dog Chow: 4 referencias.
- Chunky: 7 referencias.
- Presentaciones y precios por referencia.
- Productos para perro y una referencia Chunky para gato.

Estructura esperada:

```json
[
  {
    "marca": "Dog Chow",
    "referencias": [
      {
        "nombre": "Adulto Mediano y Grande",
        "especie": "perro",
        "descripcion": "Para perros adultos medianos y grandes",
        "presentaciones": [
          { "peso": "1kg", "precio": 20000 }
        ]
      }
    ]
  }
]
```

Reglas:

- El catalogo local manda sobre la IA.
- Una presentacion pedida debe coincidir exactamente con una presentacion disponible.
- Un cambio en `productos.json` se lee en la siguiente solicitud; no requiere reiniciar el servidor.
- El catalogo aun no maneja inventario real.

## Estado conversacional

El estado conserva, entre otros:

```js
{
  marca: null,
  criterios: {},
  ultimaSeleccion: null,
  productosConsultados: [],
  productosPendientes: [],
  referenciasPendientes: null,
  carrito: [],
  pedidoConfirmado: false,
  datosDomicilio: {},
  entrega: { tipo: null, sede: null },
  metodoPago: null,
  esperandoTipoEntrega: false,
  esperandoMetodoPago: false,
  esperandoDatosDomicilio: false,
  esperandoConfirmacionRepetirPedido: false
}
```

El objeto real contiene banderas adicionales para continuar flujos de recogida, cambio de direccion, datos previos y recomendaciones.

## Supabase

El proyecto usa REST API con una llave secreta exclusiva del backend. Ejecuta `supabase/schema.sql` en un proyecto nuevo.

| Tabla | Uso |
| --- | --- |
| `whatsapp_conversations` | Una fila por cliente con estado conversacional actual. |
| `whatsapp_messages` | Historial inbound y outbound. |
| `whatsapp_orders` | Snapshot de pedidos confirmados. |
| `training_examples` | Ejemplos curados para orientar interpretacion y tono. |

No expongas `SUPABASE_SECRET_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` en frontend.

## OpenAI

Usos separados:

| Componente | Variable | Proposito |
| --- | --- | --- |
| Interprete | `OPENAI_INTERPRETER_MODEL` | Convierte texto en JSON estructurado. |
| Vision | `OPENAI_VISION_MODEL` | Interpreta imagenes reales con alto detalle y las cruza contra el catalogo. |
| Humanizador | `OPENAI_MODEL` | Redacta la respuesta final con tono natural. |
| Voz | `OPENAI_TRANSCRIPTION_MODEL` | Transcribe audio cuando Kapso no lo hizo. |

Para imagenes, el agente usa `OPENAI_VISION_MODEL` si esta configurado; si no, cae a `OPENAI_INTERPRETER_MODEL`. Para audio, `OPENAI_TRANSCRIPTION_MODEL` permite usar modelos de transcripcion como `gpt-4o-mini-transcribe`.

Los modelos GPT-5 se invocan sin `temperature`, porque esos modelos pueden aceptar solamente el valor predeterminado. Para modelos anteriores, el interprete permite `OPENAI_INTERPRETER_TEMPERATURE`.

## Variables de entorno

Usa `.env.example` como plantilla. Grupos principales:

- Servidor: `PORT`, `NODE_ENV`.
- OpenAI: llave, modelos, timeout y banderas de activacion.
- Kapso: API key, Phone Number ID, secreto del webhook y URL base.
- Supabase: URL, llave secreta y nombres de tablas.

## Pruebas

Ejecuta:

```bash
npm test
```

Al corte de este documento existen 24 pruebas automatizadas para:

- Presentacion inexistente y barrera final de catalogo.
- Avance correcto despues de `asi esta bien`.
- Apertura de pedido sin falso positivo de marca.
- Recomendacion contextual por raza.
- Varios productos en un mensaje.
- Cotizacion sin agregar al carrito.
- Agregar productos consultados posteriormente.
- Normalizacion de texto, imagen y audio Kapso.
- Firma HMAC.
- URL de imagen y reutilizacion de transcripcion.

## Archivos de Supabase

- `supabase/schema.sql`: esquema completo para proyectos nuevos.
- `supabase/002_conversation_orders.sql`: migracion historica de pedidos.
- `supabase/003_training_examples.sql`: migracion historica de ejemplos.

Para un proyecto nuevo basta ejecutar `supabase/schema.sql`.

## Antecedente Twilio

La primera version respondia TwiML desde `POST /whatsapp`. Esa capa fue eliminada. No recrees el flujo Twilio en una version nueva salvo que exista una necesidad comercial concreta.

## Continuar En Un Proyecto Nuevo

1. Copia el codigo sin `.env`, `node_modules` ni chats crudos.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env`.
4. Crea un proyecto Supabase y ejecuta `supabase/schema.sql`.
5. Completa OpenAI y Supabase.
6. Configura primero el sandbox de Kapso siguiendo `docs/kapso-migration.md`.
7. Selecciona solamente el evento `Message received`.
8. Ejecuta `npm test`.
9. Prueba texto, cotizacion, compra, varios productos, imagen y nota de voz desde un celular autorizado.
10. Revisa `docs/known-issues-and-roadmap.md` antes de conectar un numero comercial.
