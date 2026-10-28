# Checkpoint R3 — 2026-10-28T18:02:29.141049+00:00

**Tarea abierta. SQL NO listo para producción. Cero escrituras en Supabase.**

## Trabajo guardado

- Catálogo real actualizado a R3: 309 referencias / 494 campos acumulados. SHA256 `31a8a4e12dabaa669ef492b3ea19187e4dc11e31e6b7a0c9942a6c5a20877f47`. Se preservan campos comerciales y todos los cambios de agente previos.
- 98 decisiones R3 explícitas abarcan 105 referencias; 16 incorporan `metadata.especies`, campo ya soportado. Se resolvieron 111 referencias netas desde las 367 pendientes de R2; ahora quedan 256, con 260 preguntas.
- 337 referencias / 545 campos remotos propuestos. `apply-supabase.sql` sigue bloqueado por excepción. `apply-supabase.candidate.sql` es solo para pruebas offline; cabecera advierte revisión abierta.
- 921/921 pruebas; 13 escenarios SQL; 336 comprobaciones de filtros y 3 cotizaciones. Evidencia: tests.r3.txt, sql-validation.r3.txt, behavior-validation.json.
- Lectura remota 2026-10-28T17:58:35.394Z: 1127 referencias sin cambios respecto al respaldo. Requirió acceso de red de solo lectura; no hubo denegación. Sin escritura pendiente o incierta. Sin procesos en curso.

## Compatibilidad resuelta

`metadata.especies` se conserva tanto en carga REST como RPC y los filtros existentes la consultan. Se comprobó para todos los 16 casos y para siete especies consultables. No se modificó arquitectura, lógica ni esquema. Otros campos de metadata permanecen protegidos también en SQL, incluida prueba de plan manipulado.

Pañoletas: otro/accesorio, sin lista de especies. Baytril: no añadir lista a referencia completa, porque 150 mg es canino y 50 mg canino/felino; se registra decisión de separar entidad fuera de alcance. Una consulta directa por nombre puede cotizar pañoleta para gato incluso en el respaldo original (comprobado); clasificación no resuelve ese comportamiento previo. No se corrigió lógica.

## Nuevas consolidaciones de este bloque

Ration ambiental; Alernex perros/gatos; Kiltix 66 cm perro/antipulgas; Unikat 4/18 kg y arenas Michiko felinas; Artri Balance, Omega 3-6-9 y Mieltertos suplementos; Urovital 50 canino; Delidog 156/400 g húmedo; Delicat clasificado sin inventar sabor; jabones/shampoos CanAmor separados entre higiene e insecticidas; pañitos CanAmor 50 perros/gatos; Dentastix snack. Fuentes exactas en third-review-decisions.json y evidence/r3-resume-1..5.json.

Dato protegido encontrado: código 104010102017 tiene peso 3 l derivado de PAG 3 LLEV 4. Se registra corrección separada de presentación/promoción; no se alteró ese campo.

## Pendientes

51 preguntas de variante/clasificación, 188 de destinatario sin documentar, 13 divergencias remotas, 3 límites conejo/roedor y 5 identidades ausentes. **No se declara agotada investigación ni irreducibles las 256.** research-pending-r3.json enlaza cada referencia con sus intentos, datos faltantes y estado. REVISION-MANUAL.md e INFORME.md ya reflejan R3, no los conteos R2 anteriores.

## Próximo bloque concreto

1. Consolidar fuentes primarias ya identificadas en r3-confirm*, r3-spec*, r3-label*, r3-label2* y r3-food*. No repetir las búsquedas genéricas fallidas. Las páginas de Soy del Campo devolvieron 429 en algunos opens; las capturas previas siguen disponibles. No inferir especie de menús de navegación.
2. Priorizar 13 divergencias restantes: arena BUOS/King/granel; BR Pomm Bittes; cabanos/coquitos; Seresto genérico; Country Value; cuchuco; Dog Chow x100. Country Value no aparece en web actual de Diamond: la búsqueda vuelve otras líneas, que NO prueban este SKU. Seresto requiere comprobar tamaño/variante, no propagar perros/gatos por nombre agrupado. Dog Chow x100 carece de unidad; no basta inferir pouch.
3. Natural Freshly: Bucocare web dice perro aunque aparece en relacionados felinos; no asignar ambos por relación de página. Digestar12sobres tiene ficha felina pero falta contrastar canina/etiqueta. DermaClean56g acceso web fallido. Omega/Mieltertos/Urovital ya resueltos, no repetir.
4. CanAmor árbol de té30ml tiene línea felina y canina: no asignar perro solo por marca. Shampoo Piel30ml se vinculó a Piel Sensible canino; si etiqueta contradice, registrar conflicto sin tocar nombre.
5. Registrar por referencia la conclusión de evidencia o el dato realmente faltante. `research-pending-r3.json` es inventario de intentos, no certificación automática de revisión de cada resultado.
6. Tras más decisiones: auditoría --apply-local, SQL --candidate, verificación de comportamiento, pruebas relevantes/finales y lectura remota. El generador de informes ahora usa conteos dinámicos y conserva estado de revisión; no promueve FINAL.

Los artefactos del checkpoint anterior 17:38 están en checkpoint-1738/. No despliegue, reinicio, push, WhatsApp, pedidos ni OpenAI.
