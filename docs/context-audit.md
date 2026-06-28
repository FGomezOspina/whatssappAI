# Auditoria De Contexto Conversacional

Ultima revision: 2026-06-28.

Esta auditoria describe como se usa memoria, historial, catalogo y presupuesto de IA. Es un documento de soporte; la arquitectura general vive en `docs/project-context.md`.

## Fuentes De Memoria

### `whatsapp_conversations`

Se consulta por `client_id + channel_user_id`. La columna `state` conserva memoria estructurada:

- carrito;
- productos consultados;
- ultima seleccion;
- coincidencias o presentaciones pendientes;
- entrega, direccion y metodo de pago;
- banderas de pregunta pendiente;
- ultimo pedido confirmado.

El estado se carga desde Supabase la primera vez que el proceso atiende esa conversacion. Despues se usa la copia en memoria del proceso y se persiste al final de cada turno.

### `whatsapp_messages`

Cada turno completado inserta:

1. mensaje inbound;
2. respuesta outbound.

El historial se filtra por `client_id + channel_user_id`, se ordena por fecha descendente, se limita y luego se invierte para entregarlo en orden cronologico.

El mensaje actual se envia por separado al interprete y se persiste al terminar el turno.

## Ventanas De Historial

Los limites cuentan mensajes individuales, no pares completos cliente-asistente.

| Perfil | Uso de historial |
| --- | --- |
| `simple` | Normalmente cero. |
| `producto` | Normalmente cero; fallback breve si una referencia corta no se resuelve por estado. |
| `pedido` | Historial reciente limitado. |
| `multimedia` imagen | Sin historial textual para no sesgar una foto nueva. |
| `multimedia` audio | Historial reciente limitado. |
| `complejo` | Contexto ampliado dentro de presupuesto. |

Riesgo: un limite de tres mensajes no equivale a tres turnos completos.

## Payload Del Interprete

OpenAI recibe:

1. `system`: prompt de perfil, esquema JSON y reglas de cliente/vertical.
2. `user`: JSON compacto con mensaje actual, intencion detectada, cliente, estado operativo, historial reciente, ejemplos y candidatos de catalogo.

Antes de construir el payload:

- `interactionClassifier` define perfil, modelos y limites.
- `catalogContextService` recupera candidatos FTS/RPC y fuzzy local.
- `productMatchValidator` hace una validacion previa; si detecta consulta generica o de categoria sin marca explicita, puede dejar que el motor de la vertical responda sin llamar al interprete.
- `contextBuilder` reduce bloques si se supera presupuesto.

Orden de reduccion:

1. ejemplos;
2. historial mas antiguo;
3. descripciones largas;
4. candidatos adicionales;
5. memoria no activa en perfil producto.

El catalogo completo no se envia a OpenAI, pero queda disponible para validacion backend.

## Payload Del Humanizador

El humanizador recibe:

- intencion y accion interpretadas;
- producto o carrito relevante;
- estado operativo compacto;
- mensaje actual recortado;
- respuesta operativa ya decidida.

No recibe historial completo. La respuesta operativa conserva los hechos; el humanizador solo mejora tono.

## Resolucion De Referencias Cortas

Se resuelven primero desde estado:

- `si`, `ese`, `esa`, `el primero`: coincidencias o selecciones pendientes;
- pesos: `ultimaSeleccion`, `referenciasPendientes` o productos consultados;
- entrega/pago: banderas `esperando*`;
- repeticion de pedido: snapshot de ultimo pedido confirmado.

Esto ahorra tokens y evita pedir al modelo reconstruir hechos comerciales desde texto libre.

## Imagenes

Una imagen nueva limpia el foco temporal de productos anteriores. Conserva carrito y entrega activos, pero omite historial textual y productos consultados para evitar sesgo.

La lectura visual extrae marca, linea/variante, especie, etapa, tamano, condicion, presentacion, sabor y texto visible. Una marca sola no confirma una referencia. Si la primera lectura omite una senal critica o deja ambiguedad real, puede ejecutarse una segunda lectura enfocada con candidatos refinados.

`AI_VISION_REFINEMENT=false` desactiva esa segunda llamada.

## Matching

`productMatchValidator` compara interpretacion contra:

- marca y referencia;
- descripcion;
- aliases;
- `metadata.original_names`;
- referencias equivalentes;
- categoria, subcategoria, especie, etapa, tamano, condicion y sabor;
- presentaciones disponibles;
- disponibilidad basica de presentaciones cuando `stock` viene en catalogo;
- errores de escritura tolerables.

`catalogConsolidationService` agrupa typos compatibles y fusiona presentaciones. No contiene excepciones por producto.

Las consultas por familias como medicamentos, antipulgas, desparasitantes, snacks, juguetes, accesorios o arena se tratan como busquedas de categoria/subcategoria. El sistema debe conservar esos criterios sin convertirlos en una marca desconocida ni arrastrar una referencia pendiente de comida.

## Casos Sin Historial

- Saludo simple.
- Consulta nueva y explicita de producto.
- Seleccion determinista de una coincidencia pendiente.
- Validacion temprana de catalogo.
- Humanizador.
- Imagen nueva.
- Consulta exploratoria de categoria con validacion suficiente.

No siempre implica perdida: varios casos se resuelven mejor con estado y catalogo. El riesgo aparece cuando el dato importante quedo solo en texto libre y no en estado estructurado.

## Riesgos Detectados

1. Los limites de historial son por mensaje, no por turno completo.
2. Una cache en memoria por proceso puede divergir en despliegues con varias instancias.
3. Si falla una insercion en `whatsapp_messages`, el estado puede quedar mas completo que el historial textual.
4. Imagenes y audios se persisten como texto procesado/transcrito; el archivo original no queda en historial.
5. La consolidacion fuzzy debe monitorearse para no unir referencias comercialmente distintas.
6. La segunda lectura visual mejora precision, pero agrega costo en casos ambiguos.

## Logs De Diagnostico

Activar solo temporalmente:

```env
AI_CONTEXT_PAYLOAD_LOGS=true
PRODUCT_CONTEXT_LOGS=true
AI_CONTEXT_LOGS=true
AI_USAGE_LOGS=true
```

Logs utiles:

- `[AI Context Retrieval]`: historial recuperado y limites.
- `[AI Context Payload]`: payload final hacia OpenAI.
- `[Product Context]`: fuente de resolucion de productos.
- `[Catalog Search]`: estrategia, query y candidatos.
- `[OpenAI] Revision visual`: lectura inicial/refinada/elegida.

Estos logs pueden contener mensajes, direcciones y datos personales. No deben quedar activos en produccion.

## Mejoras Propuestas

1. Recuperar turnos completos inbound/outbound.
2. Proteger un minimo de dos turnos para pedidos activos.
3. Persistir `ultimaPreguntaAsistente` para referencias naturales.
4. Revisar cache/locking para despliegue horizontal.
5. Medir falsos positivos de vision y consolidacion.
6. Evaluar embeddings por cliente solo si FTS + fuzzy no alcanza con casos reales.
