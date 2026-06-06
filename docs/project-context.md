# Contexto tecnico vigente

Fecha de corte: 2026-06-03.

Este documento es el relevo tecnico para continuar el proyecto o iniciar una version nueva sin depender de conversaciones anteriores. Describe el codigo actual. Twilio fue retirado del flujo activo y Kapso es el proveedor de WhatsApp.

## Objetivo

Construir un asesor conversacional de WhatsApp para clientes de la plataforma AIVANCE. Distrifinca es el primer cliente configurado. Debe comprender como escribe realmente un cliente, ayudar a cotizar o comprar, recomendar productos y completar un pedido sin sonar como un formulario rigido.

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
  J --> K["OpenAI transcripcion"]
  E --> L["aiInterpreter OpenAI"]
  E --> V["verticals/index"]
  V --> M["verticals/petshop/orderLogic"]
  M --> N["Supabase catalogo por cliente"]
  E --> O["humanizer OpenAI"]
  V --> P["verticals/petshop/productLogic"]
  E --> D
  D --> B
```

### Separacion por capas

| Archivo | Responsabilidad |
| --- | --- |
| `src/app.js` | Rutas HTTP, firma del webhook, respuesta rapida e idempotencia basica. |
| `src/providers/kapsoMessagingProvider.js` | Entrada y salida especificas de Kapso. Normaliza JSON, multimedia y envio de texto. |
| `src/services/conversationService.js` | Orquesta multimedia, cliente, estado, ejemplos, OpenAI, motor comercial y persistencia. |
| `src/services/mediaProcessor.js` | Entrega URL de imagen a vision y transcribe audio cuando hace falta. |
| `src/services/aiInterpreter.js` | Convierte lenguaje libre en JSON estructurado para el motor. |
| `src/verticals/petshop/orderLogic.js` | Valida catalogo petshop y aplica operaciones reales sobre carrito, entrega y pago. |
| `src/verticals/index.js` | Selecciona la logica vertical segun `aivance_clients.vertical`. |
| `src/services/humanizer.js` | Convierte la respuesta operativa en texto natural sin cambiar hechos. |
| `src/verticals/petshop/productLogic.js` | Ultima barrera petshop ante afirmaciones de presentaciones inexistentes. |
| `src/services/clients.service.js` | Resuelve el cliente por canal Kapso, carga configuracion, prompts y reglas desde Supabase. |
| `src/conversation/conversationStore.js` | Estado conversacional en memoria y persistencia delegada a Supabase. |
| `src/repositories/*` | Catalogo, conversaciones, pedidos y ejemplos curados. |

Para cambiar de proveedor de mensajeria, crea otro adaptador equivalente a `kapsoMessagingProvider.js` y cambia la importacion del provider en `src/app.js`. El resto del flujo no debe conocer detalles del proveedor.

## Flujo de un mensaje

1. Kapso envia un evento `whatsapp.message.received`.
2. `src/app.js` valida `x-webhook-signature` contra el cuerpo HTTP crudo, extrae eventos y responde HTTP `200 OK` inmediatamente.
3. El provider normaliza cliente, destinatario, texto, `phone_number_id`, idempotencia y multimedia.
4. La app agrupa los mensajes consecutivos del mismo cliente y reinicia una espera corta con cada entrada para procesar un solo lote.
5. `conversationService` resuelve el cliente AIVANCE por `phone_number_id` consultando `client_channels` y `aivance_clients`.
6. `conversationService` lee `aivance_clients.vertical` como tipo de negocio y carga la vertical correspondiente.
7. `conversationService` carga el estado y el historial reciente del usuario desde Supabase antes de llamar a OpenAI.
8. Si hay audio, reutiliza la transcripcion de Kapso o descarga el archivo y lo envia a OpenAI para transcripcion.
9. Si hay imagen, pasa la URL publica al interprete OpenAI con capacidades de vision.
10. El interprete devuelve JSON con intencion, accion, productos, entrega, datos del cliente y operacion de carrito.
11. La vertical petshop valida contra el catalogo cargado desde Supabase para el cliente resuelto y modifica el estado solamente cuando corresponde.
12. `humanizer` mejora el tono sin alterar precios, pesos, cantidades ni acciones.
13. La barrera de catalogo de la vertical bloquea una afirmacion incompatible con el catalogo.
14. El estado, el historial y un pedido confirmado se guardan en Supabase con `client_id`.
15. El provider envia la respuesta por Kapso.

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
- Supabase es obligatorio para resolver cliente y catalogo.
- Si OpenAI falla, el backend conserva la respuesta operativa validada por catalogo.

## Plataforma y multiempresa

AIVANCE es la plataforma propietaria del software. Los clientes de la plataforma viven en `aivance_clients`; Distrifinca queda registrado con `slug = distrifinca`. Conversaciones, mensajes, pedidos, canales y catalogo se relacionan con `client_id`.

Resolucion de cliente:

- En produccion, el cliente se identifica por el canal entrante: `provider=kapso`, `channel=whatsapp`, `phone_number_id`.
- `phone_number_id` se busca en `client_channels` y de ahi se carga el cliente activo en `aivance_clients`.
- Fuera de produccion, el sandbox puede resolver temporalmente por `KAPSO_SANDBOX_CLIENT_SLUG` si el `phone_number_id` entrante coincide con `KAPSO_SANDBOX_PHONE_NUMBER_ID` o `KAPSO_PHONE_NUMBER_ID`.
- `aivance_clients.vertical` define la vertical o tipo de negocio. Distrifinca usa `petshop`.
- No se cambia `.env` para agregar clientes.
- `CLIENT_SLUG` y `CLIENT_NAME` no forman parte del `.env` operativo.
- Prompts/reglas por cliente viven en `client_prompts` y `client_delivery_rules`.

## Catalogo

La fuente de verdad operativa vive en Supabase, en tablas normalizadas por cliente:

- `catalog_brands`
- `catalog_references`
- `catalog_presentations`

`productos.json` se conserva como formato de importacion masiva, no como fuente del agente. Actualmente contiene el catalogo inicial de Distrifinca:

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

Flujo de carga:

```text
Excel -> JSON compatible con productos.json -> npm run catalog:import -> Supabase
```

Reglas:

- El catalogo de Supabase manda sobre la IA.
- Una presentacion pedida debe coincidir exactamente con una presentacion disponible.
- Un cambio en Supabase se lee en la siguiente solicitud; no requiere reiniciar el servidor.
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
| `aivance_clients` | Empresas cliente de la plataforma AIVANCE. |
| `client_channels` | Canales por cliente, por ejemplo Kapso WhatsApp. |
| `client_prompts` | Instrucciones adicionales por cliente para interprete o humanizador. |
| `client_delivery_rules` | Reglas/fletes por cliente expresados como JSON simple. |
| `catalog_brands` | Marcas por cliente. |
| `catalog_references` | Referencias por marca. |
| `catalog_presentations` | Presentaciones y precios por referencia. |
| `whatsapp_conversations` | Una fila por cliente final de WhatsApp y empresa AIVANCE. |
| `whatsapp_messages` | Historial inbound y outbound por empresa. |
| `whatsapp_orders` | Snapshot de pedidos confirmados por empresa. |
| `training_examples` | Ejemplos curados globales o por empresa. |

No expongas `SUPABASE_SECRET_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` en frontend.

## OpenAI

Usos separados:

| Componente | Variable | Proposito |
| --- | --- | --- |
| Interprete | `OPENAI_INTERPRETER_MODEL` | Convierte texto en JSON estructurado. |
| Vision | `OPENAI_VISION_MODEL` | Interpreta imagenes reales con alto detalle y las cruza contra el catalogo. |
| Humanizador | `OPENAI_MODEL` | Redacta la respuesta final con tono natural. |
| Voz | `OPENAI_TRANSCRIPTION_MODEL` | Transcribe audio cuando Kapso no lo hizo. |
| Voz fallback | `OPENAI_TRANSCRIPTION_FALLBACK_MODEL` | Modelo alterno si falla el transcriptor principal. |

Para imagenes, el agente usa `OPENAI_VISION_MODEL` si esta configurado; si no, cae a `OPENAI_INTERPRETER_MODEL`. Para audio, `OPENAI_TRANSCRIPTION_MODEL` permite usar modelos de transcripcion como `gpt-4o-mini-transcribe`; si falla, intenta `OPENAI_TRANSCRIPTION_FALLBACK_MODEL` y luego usa el transcript de Kapso si venia disponible.

Los modelos GPT-5 se invocan sin `temperature`, porque esos modelos pueden aceptar solamente el valor predeterminado. Para modelos anteriores, el interprete permite `OPENAI_INTERPRETER_TEMPERATURE`.

### Optimizacion de contexto y costos

Antes de llamar a OpenAI, `src/services/conversationService.js` clasifica la interaccion con `src/services/interactionClassifier.js`. Esa clasificacion define si el turno es saludo, busqueda, precio, domicilio, audio, imagen, continuacion o caso complejo. Con eso se decide:

- cuantos mensajes recientes consultar desde Supabase;
- cuantos ejemplos curados cargar;
- que modelo usar para interprete y humanizador;
- si el turno puede responderse sin OpenAI;
- si hace falta contexto de catalogo;
- cuantos productos candidatos enviar al modelo.

El catalogo completo sigue cargandose desde Supabase y el motor lo usa como fuente de verdad para validar marcas, referencias, presentaciones y precios. OpenAI ya no necesita recibir todo el catalogo: `src/services/catalogContextService.js` consulta candidatos con `src/repositories/productRepository.js` usando la RPC `search_catalog_products`. Esa RPC vive en `supabase/005_catalog_search_rpc.sql`, filtra siempre por `client_id` y combina Full Text Search, trigramas, normalizacion `unaccent` y sinonimos comunes. Si la RPC falla o aun no existe, el backend usa el selector local como fallback seguro y registra el evento.

El sistema queda preparado para cambiar `CATALOG_SEARCH_STRATEGY=semantic` cuando exista busqueda vectorial o embeddings por cliente. En ese modo futuro, cada referencia debe tener un texto unificado de busqueda y embeddings filtrados por `client_id`; por ahora la implementacion completa activa es FTS/RPC.

La memoria se envia al modelo en tres niveles mediante `src/services/contextBuilder.js`:

- Nivel 1: conversacion activa, carrito, seleccion pendiente, productos consultados y entrega actual.
- Nivel 2: perfil resumido del cliente, datos frecuentes y ultimo pedido confirmado.
- Nivel 3: historial completo conservado en Supabase, sin reenviarlo automaticamente.

La observabilidad de uso de IA vive en `src/services/aiUsageLogger.js` y registra etapa, cliente, intencion, modelo, duracion, uso de imagen/audio, productos enviados y tokens reportados por OpenAI.

## Variables de entorno

Usa `.env` como archivo unico de configuracion local. Grupos principales:

- Servidor: `PORT`, `NODE_ENV`.
- OpenAI: llave, modelos, timeout y banderas de activacion.
- Kapso: API key, Phone Number ID, secreto del webhook y URL base.
- Supabase: URL, llave secreta, cache de clientes y nombres de tablas.

El `KAPSO_PHONE_NUMBER_ID` se conserva para enviar respuestas por el numero configurado y para pruebas locales, pero la propiedad multiempresa vive en `client_channels`.

Variables de optimizacion opcionales:

- `OPENAI_INTERPRETER_MODEL_SIMPLE`: modelo economico para turnos simples.
- `OPENAI_INTERPRETER_MODEL_PRODUCT`: modelo economico para busquedas y precios sin pedido activo.
- `OPENAI_INTERPRETER_MODEL_ORDER`: modelo para pedidos en construccion.
- `OPENAI_INTERPRETER_MODEL_COMPLEX`: modelo avanzado para casos complejos.
- `OPENAI_HUMANIZER_MODEL`: modelo por defecto del humanizador.
- `OPENAI_HUMANIZER_MODEL_SIMPLE`: modelo economico del humanizador.
- `OPENAI_HUMANIZER_MODEL_PRODUCT`: modelo del humanizador cuando se habilita para busquedas simples.
- `OPENAI_HUMANIZER_MODEL_COMPLEX`: modelo avanzado del humanizador.
- `CATALOG_CONTEXT_MAX_REFERENCES`: maximo de referencias candidatas enviadas a OpenAI en texto.
- `VISION_CATALOG_CONTEXT_MAX_REFERENCES`: maximo de referencias candidatas enviadas a OpenAI en vision.
- `CATALOG_MATCH_HIGH_THRESHOLD`: similitud minima para confirmar una coincidencia unica; por defecto `0.84`.
- `CATALOG_MATCH_MEDIUM_THRESHOLD`: similitud minima para mostrar opciones como posibles coincidencias; por defecto `0.68`.
- `CATALOG_MATCH_AMBIGUITY_MARGIN`: diferencia minima entre el primer y segundo resultado; por defecto `0.08`.
- `CATALOG_MATCH_ALTERNATIVE_LIMIT`: maximo de opciones mostradas cuando la coincidencia es ambigua; por defecto `3`.
- `SUPABASE_CATALOG_SEARCH_RPC`: nombre de la RPC de busqueda; por defecto `search_catalog_products`.
- `CATALOG_SEARCH_BACKEND`: usar `local` para desactivar temporalmente la RPC y forzar fallback local.
- `CATALOG_SEARCH_LOGS`: usar `false` para apagar logs de busqueda de catalogo.
- `OPENAI_HISTORY_SIMPLE_LIMIT`, `OPENAI_HISTORY_NORMAL_LIMIT`, `OPENAI_HISTORY_COMPLEX_LIMIT`: limites de historial reciente enviado al modelo.
- `OPENAI_HISTORY_ORDER_LIMIT`: historial maximo para un pedido activo; por defecto `3`.
- `TRAINING_EXAMPLES_SIMPLE_LIMIT`, `TRAINING_EXAMPLES_NORMAL_LIMIT`, `TRAINING_EXAMPLES_COMPLEX_LIMIT`: limites de ejemplos curados por complejidad.
- `TRAINING_EXAMPLES_ORDER_LIMIT`: ejemplos maximos para un pedido activo; por defecto `2`.
- `AI_USAGE_LOGS`: usar `false` para apagar logs de uso de IA.
- `AI_CONTEXT_LOGS`: activa el desglose aproximado de caracteres y tokens por bloque antes de cada llamada.
- `AI_CONTEXT_BUDGET_INTERPRETER_<PERFIL>`: presupuesto estimado para `SIMPLE`, `PRODUCTO`, `PEDIDO`, `MULTIMEDIA` o `COMPLEJO`.
- `AI_CONTEXT_BUDGET_HUMANIZER_<PERFIL>`: presupuesto equivalente del humanizador.
- `AI_CONTEXT_CHARS_PER_TOKEN`: relacion conservadora para estimar tokens antes de llamar al API; por defecto `4`.
- `AI_PRODUCT_DESCRIPTION_MAX_CHARS`: longitud maxima de descripcion por candidato; por defecto `120`.
- `HUMANIZER_PRODUCT_SEARCH`: usar `true` para volver a humanizar busquedas simples; por defecto se conserva la respuesta operativa y se evita la segunda llamada.
- `HUMANIZER_PRODUCT_MAX_BASE_CHARS`: longitud maxima de respuesta base elegible para omitir el humanizador; por defecto `1600`.
- `AI_TOKEN_BASELINE_INTERPRETER` y `AI_TOKEN_BASELINE_HUMANIZER`: linea base opcional para calcular reduccion porcentual en logs.
- `CATALOG_SEARCH_STRATEGY`: reservado para `keyword` o `semantic`; la busqueda actual usa FTS/RPC en Supabase con fallback local seguro.

### Presupuestos de contexto

El contexto enviado a OpenAI se construye por perfil sin modificar lo almacenado en Supabase:

- `simple`: sin historial ni catalogo cuando no hacen falta.
- `producto`: mensaje actual, contexto pendiente breve y candidatos compactos; sin historial ni ejemplos si no hay pedido activo.
- `pedido`: carrito, datos operativos pendientes y un historial reciente limitado.
- `multimedia`: instrucciones de audio/vision y candidatos, con contexto operativo acotado.
- `complejo`: contexto ampliado dentro del presupuesto configurado.

Los candidatos enviados al interprete omiten ids, metadata, timestamps y stock interno. Conservan marca, nombre, categoria, especie, etapa, descripcion breve, presentaciones y precios. El humanizador no recibe historial completo, ejemplos ni memoria duplicada.

Antes del interprete, `productMatchValidator` compara marca, referencia, aliases, etapa, tamano, especie y errores de escritura contra el catalogo completo. Una coincidencia baja responde "no encontrado" sin llamar a OpenAI; una coincidencia media muestra opciones como posibles coincidencias; solo una coincidencia alta puede continuar como producto confirmado. En imagenes, la misma validacion se ejecuta despues de extraer marca y referencia visibles.

Diagnostico contra el catalogo real, sin guardar conversacion ni enviar mensajes:

```bash
npm run ai:diagnose -- "tienes br adulto r pequena?"
```

Para ejecutar tambien las llamadas a OpenAI y obtener tokens reales:

```bash
npm run ai:diagnose -- --live "tienes br adulto r pequena?"
```

## Pruebas

Ejecuta:

```bash
npm test
```

Al corte de este documento existen 124 pruebas automatizadas para:

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
- Resolucion multiempresa por canal Kapso.
- Persistencia de conversaciones, mensajes y pedidos por cliente.
- Importacion de catalogo multiempresa desde JSON.
- Buffer de mensajes consecutivos por cliente.
- Reglas de humanizacion para no alterar acciones operativas.

## Archivos de Supabase

- `supabase/schema.sql`: esquema completo multiempresa para proyectos nuevos.
- `supabase/002_conversation_orders.sql`: migracion historica de pedidos.
- `supabase/003_training_examples.sql`: migracion historica de ejemplos.
- `supabase/004_multiempresa_catalog.sql`: migracion de una base existente hacia clientes AIVANCE y catalogo en Supabase.
- `supabase/005_catalog_search_rpc.sql`: extensiones, indices y RPC de busqueda FTS/trigram por cliente.

Para un proyecto nuevo basta ejecutar `supabase/schema.sql`.

## Antecedente Twilio

La primera version respondia TwiML desde `POST /whatsapp`. Esa capa fue eliminada. No recrees el flujo Twilio en una version nueva salvo que exista una necesidad comercial concreta.

## Continuar En Un Proyecto Nuevo

1. Copia el codigo sin `.env`, `node_modules` ni chats crudos.
2. Ejecuta `npm install`.
3. Revisa y completa `.env`.
4. Crea un proyecto Supabase y ejecuta `supabase/schema.sql`.
5. Completa OpenAI y Supabase en `.env`.
6. Configura primero el sandbox de Kapso siguiendo `docs/kapso-migration.md`.
7. Selecciona solamente el evento `Message received`.
8. Ejecuta `npm test`.
9. Prueba texto, cotizacion, compra, varios productos, imagen y nota de voz desde un celular autorizado.
10. Revisa `docs/known-issues-and-roadmap.md` antes de conectar un numero comercial.
