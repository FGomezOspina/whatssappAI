# Auditoria de contexto conversacional

Fecha: 2026-06-06.

Esta auditoria describe el flujo actual. La instrumentacion agregada es opt-in y no cambia limites, prompts ni decisiones del agente.

## Fuentes de memoria

### `whatsapp_conversations`

Se consulta por `client_id + channel_user_id`. La columna `state` conserva memoria estructurada:

- carrito y productos consultados;
- ultima seleccion;
- referencias y coincidencias pendientes;
- datos de entrega y metodo de pago;
- banderas de la pregunta operativa pendiente;
- ultimo pedido confirmado.

El estado se carga desde Supabase la primera vez que el proceso atiende esa conversacion. Despues se reutiliza la copia en memoria del proceso y se actualiza al persistir cada respuesta.

### `whatsapp_messages`

Cada interaccion completada inserta:

1. mensaje `inbound`;
2. respuesta `outbound`.

La consulta de historial filtra por `client_id + channel_user_id`, ordena por `created_at desc`, limita la cantidad y luego invierte el resultado para entregarlo cronologicamente. No filtra por direccion, por lo que incluye mensajes del cliente y del asistente.

El mensaje actual aun no esta almacenado cuando se llama a OpenAI. Se envia separadamente como `mensaje` y se persiste junto con la respuesta al terminar el turno.

## Ventanas actuales

Los limites cuentan mensajes individuales, no turnos completos.

| Perfil | Historial por defecto |
| --- | ---: |
| `simple` | 0 |
| `producto` | 0 normalmente; 2 como fallback contextual |
| `pedido` | 3 |
| `multimedia` con imagen | 0 |
| `multimedia` con audio | 8 |
| `complejo` | 8 |

Consecuencia: un limite de `3` suele contener un turno completo y un mensaje suelto del turno anterior. No equivale a tres intercambios cliente-asistente.

`OPENAI_HISTORY_SIMPLE_LIMIT` y `OPENAI_HISTORY_NORMAL_LIMIT` tienen poco uso efectivo con el router vigente. Las consultas explicitas de producto conservan historial cero. Una referencia corta no resuelta por estado puede usar `OPENAI_HISTORY_PRODUCT_FALLBACK_LIMIT`, por defecto `2`.

## Contexto del interprete

El interprete recibe dos mensajes OpenAI:

1. `system`: prompt del perfil, esquema JSON y reglas del cliente/vertical.
2. `user`: un JSON con:
   - mensaje actual;
   - intencion detectada;
   - cliente;
   - estado operativo compacto;
   - historial reciente;
   - ejemplos;
   - candidatos de catalogo.

El historial convierte `inbound` en `cliente` y `outbound` en `asistente`. Cada cuerpo se recorta a 500 caracteres.

Si se supera el presupuesto, se eliminan en este orden:

1. ejemplos;
2. mensajes historicos mas antiguos;
3. descripciones de productos;
4. candidatos adicionales;
5. memoria no activa del perfil producto.

Por tanto, incluso cuando Supabase recupera historial, el constructor puede reducirlo antes de la llamada.

## Contexto del humanizador

El humanizador no recibe historial de mensajes. Recibe:

- intencion y accion interpretadas;
- producto interpretado;
- estado operativo compacto;
- mensaje actual recortado;
- respuesta operativa ya decidida.

Esto es deliberadamente barato. El parametro `historialReciente` se pasa al servicio, pero no se incluye en la solicitud compacta actual.

## Cobertura de referencias recientes

Las referencias operativas cortas se resuelven principalmente con `state`, no con texto historico:

- `si`, `ese`, `el primero`: selecciones y coincidencias pendientes;
- pesos o presentaciones: `ultimaSeleccion` y `referenciasPendientes`;
- productos cotizados: `productosConsultados`;
- entrega/pago: banderas `esperando*`;
- carrito y pedido anterior: snapshots estructurados.

Esto reduce tokens y es mas confiable que pedir al modelo reconstruir hechos comerciales. Sin embargo, matices libres que no quedaron estructurados pueden perderse en perfiles con historial cero.

Una imagen nueva limpia el foco temporal del producto anterior antes de interpretar vision. El payload conserva carrito, entrega y datos operativos activos, pero omite seleccion anterior, productos cotizados, historial textual y ejemplos. Asi la nueva foto no queda sesgada por la referencia identificada en una imagen previa.

La validacion visual no trata una marca legible como referencia confirmada. Combina linea, especie, etapa, tamano, condicion terapeutica y presentacion contra todo el catalogo. Normaliza nombres comerciales visibles contra referencias internas: ignora claims o submarcas no guardadas literalmente, traduce especies como `cat/gato`, agrupa typos de linea como `URINAY/URINARY` y corrige presentaciones tipo `KR` a `KG`. Si varias senales visibles convergen en una sola referencia, continua directamente con su precio o presentaciones; si solo se reconoce la marca o quedan referencias compatibles, conserva la ambiguedad y pide un dato visible faltante. Etapa y tamano tambien eliminan opciones contradictorias, por ejemplo cachorro frente a adulto o razas pequenas frente a una linea senior.

La misma identidad normalizada se usa para texto y audio transcrito. Cuando el cliente agrega detalle adicional a la marca, como `for dog`, `adulto`, `grandes`, `pequenas`, `15kg` o una condicion terapeutica, la referencia debe ganar por esas senales y no por orden del catalogo. Las referencias con condicion o formato no solicitado se mantienen por debajo del umbral medio para no ofrecer `lata`, `pouch`, `obesos`, `esterilizado` o `piel` si el cliente pidio una linea adulta normal.

## Casos donde no se usa historial

- Busqueda nueva y explicita de producto sin estado activo.
- Saludo/general simple que se responde sin OpenAI.
- Seleccion determinista de una coincidencia pendiente.
- Consulta exploratoria de categoria resuelta por el motor.
- Respuestas tempranas de validacion de catalogo.
- Humanizador, en todos los perfiles.

Estos casos no implican necesariamente perdida: varios se resuelven directamente con catalogo y estado. El riesgo aparece cuando una referencia natural depende de texto previo que no fue convertido a estado.

## Riesgos detectados

1. `pedido` recupera tres mensajes, no tres turnos. Puede empezar con una respuesta del asistente separada de la pregunta que la origino.
2. `producto` usa historial cero para consultas explicitas. Referencias como `ese`, `el primero`, `si` o `el de 3kg` intentan primero resolver estado y, si falta, pueden recuperar un turno.
3. El historial normal puede reducirse por presupuesto. El turno minimo de fallback de producto queda protegido y reduce primero descripciones y candidatos.
4. `memoriaOperativa` se construye en `conversationService`, pero el payload compacto vuelve a construir memoria desde `estado`; el objeto de tres niveles no se usa.
5. La cache por proceso no vuelve a leer `whatsapp_conversations` mientras la conversacion exista en memoria. En despliegues con varias instancias pueden existir estados temporalmente divergentes.
6. Si falla una insercion individual en `whatsapp_messages`, el `state` puede quedar guardado aunque el historial textual quede incompleto.
7. Imagenes y audios se persisten como texto procesado/transcrito; el archivo visual o sonoro no forma parte del historial textual posterior.

## Logs temporales

Activar solamente durante diagnostico:

```env
AI_CONTEXT_PAYLOAD_LOGS=true
```

Genera:

- `[AI Context Retrieval]`: limite, mensajes recuperados, direcciones, estado activo y cuerpos obtenidos desde Supabase.
- `[AI Context Payload]`: `system` y `user` finales inmediatamente antes de OpenAI.
- `[Product Context]`: referencias pendientes, ultima seleccion, productos consultados, resolucion por estado o busqueda nueva y activacion del fallback.

Las imagenes se registran solo como tipo, detalle y cantidad de caracteres; no se imprime el base64. Los logs pueden contener mensajes, direcciones y datos personales. No deben permanecer activos en produccion.

## Mejoras propuestas

No implementadas en esta auditoria:

1. Expresar los limites en turnos completos y recuperar pares `inbound/outbound`.
2. Para perfil `pedido`, conservar como minimo los dos ultimos turnos completos.
3. Persistir una propiedad breve como `ultimaPreguntaAsistente` para referencias naturales no cubiertas por otras banderas.
4. Eliminar o conectar formalmente `memoriaOperativa` para evitar dos representaciones de memoria.
5. Mantener el humanizador sin historial salvo que aparezca un caso concreto que la respuesta operativa no pueda cubrir.
6. En despliegue horizontal, revisar cache por proceso, versionado del estado o bloqueo optimista.
