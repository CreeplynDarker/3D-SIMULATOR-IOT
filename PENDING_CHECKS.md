# Verificaciones humanas pendientes

Estas son las 21 verificaciones `[human]` que las pruebas automáticas no pueden firmar. Vienen de la sección
"Waiting for human review" de `docs/PROGRESS.md`. Cuando una persona complete una, debe marcar su casilla aquí, anotar
su nombre, la fecha y el resultado, y mover la línea correspondiente de `docs/PROGRESS.md` a una nota de cierre.

Las verificaciones están ordenadas por prioridad, de 1 (más importante) a 4:

| Prioridad       | Significado                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| **1 · Crítica** | Afecta a la seguridad, a la demo de la presentación o a la integración con la placa. Sin ella no se debería entregar. |
| **2 · Alta**    | Afecta a la evaluación o a la comprensión del proyecto. Hacerla antes de la presentación.                             |
| **3 · Media**   | Mejora la calidad o la fidelidad. Hacerla si hay tiempo antes de la entrega.                                          |
| **4 · Baja**    | Detalle cosmético u opcional, o ya cubierto en parte por pruebas automáticas.                                         |

Las verificaciones con ID **B1–B7** son nuevas: vienen de los cambios para igualar el simulador al cableado real del
banco (decisiones D-078 a D-084 en `docs/DECISIONS.md`).

Qué se puede hacer ya y qué no:

- **Necesitan la placa real con el firmware del equipo:** verificaciones 2, 3, 5 y 18.
- **Necesitan la placa real, pero no el firmware completo** (basta un sketch de prueba): verificaciones 1 y 10.
- **Se puede hacer ya con el ESP32 emulado:** verificación 6.
- **El resto:** se puede hacer ya, solo con el navegador, el portátil o el documento de cableado.

Orden de trabajo sugerido:

1. Ya, sin placa: las verificaciones 4, 6, 7, 8, 9, 11 (prioridad 1 y 2 que no la necesitan) y la 13, que es la base del
   firmware.
2. Con la placa montada y antes de escribir el firmware: la 1 (que el relé se suelte) y la 10 (montaje del
   GY-521).
3. Con el firmware listo: la 3, luego la 5 y por último la 2 (E-STOP).

## Preparación común

Sitio publicado (no requiere instalar nada): https://creeplyndarker.github.io/3D-SIMULATOR-IOT/

Para trabajar en local (Node 22 y pnpm 10):

```bash
git clone https://github.com/CreeplynDarker/3D-SIMULATOR-IOT.git
```

```bash
cd 3D-SIMULATOR-IOT
```

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm build
```

```bash
pnpm preview
```

`pnpm preview` sirve la versión compilada en http://localhost:4173. Para pruebas de rendimiento, usar siempre esta
versión o el sitio publicado, nunca `pnpm dev`.

Atajos útiles dentro de la app:

| Tecla   | Acción               |
| ------- | -------------------- |
| Espacio | Reproducir / pausar  |
| S       | START                |
| E       | E-STOP               |
| R       | RESET                |
| 1 a 5   | Cámaras predefinidas |
| `?`     | Leyenda y ayuda      |

Si se añade `?debug=1` a la URL, la consola del navegador expone `window.__sim` (fps, estado, tiempo) y
`window.__pdm` (inspección del estado), útiles para medir.

---

## Prioridad 1 · Crítica

### 1. B3 · El relé CH2 se suelta con IN2 en ALTO (3,3 V) con el módulo a 5 V

**Prioridad 1 (crítica).** Seguridad: si el relé no se suelta, el ventilador no se para ni con un disparo ni con
E-STOP. Es requisito de la verificación 2. No necesita el firmware completo, solo un sketch de prueba.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** con el jumper JD-VCC–VCC puesto y el módulo entero a 5 V (D-080), un ALTO del ESP32 deja unos
1,7 V sobre el LED del optoacoplador de IN2 y su resistencia. En algunos módulos circula todavía algo de corriente y
el relé **no se suelta**.

**Cómo hacerlo:**

1. Cablear el relé como en el documento: VCC en C25 (fila de 5 V, alimentada por VIN), GND al riel azul izquierdo,
   IN2 a D26 y el jumper puesto. Al principio, sin los 12 V conectados; después repetir con el ventilador conectado y
   el interruptor de 12 V a mano.
2. Cargar en el ESP32 este sketch, que alterna GPIO26 cada 2 s:

   ```cpp
   void setup() { pinMode(26, OUTPUT); }
   void loop() { digitalWrite(26, LOW); delay(2000); digitalWrite(26, HIGH); delay(2000); }
   ```

3. Con LOW, el relé debe hacer clic y encender su LED CH2. Con HIGH, debe hacer clic al soltarse y apagar el LED.
   Con un multímetro en continuidad, COM2–NO2 debe estar cerrado en LOW y abierto en HIGH.
4. Dejarlo 10 ciclos seguidos.
5. **Si no se suelta:** para apagar, dejar IN2 flotante en vez de en ALTO, para que suba a 5 V por el pull-up del
   módulo. Probar con este sketch (el pin vuelve a ser salida antes de cada LOW):

   ```cpp
   void loop() {
     pinMode(26, OUTPUT); digitalWrite(26, LOW); delay(2000);  // relé activado
     pinMode(26, INPUT); delay(2000);                           // IN2 flotante: relé suelto
   }
   ```

   Si así funciona, hay que cambiar `relayOff()` e `relayInit()` en `src/firmware/reference-cpp/relay.cpp` y en el
   firmware real (o usar `OUTPUT_OPEN_DRAIN`), y registrar la decisión en `docs/DECISIONS.md`.

**Aprobado si** el relé se suelta en los 10 ciclos con IN2 en ALTO (o con la alternativa del paso 5, ya registrada).

### 2. P8 · `btn-estop` en modo Live abre el relé real

**Prioridad 1 (crítica).** Seguridad: es la única parada que se lanza desde la app sobre el banco real. Depende de las verificaciones 1, 3, 5 y 6.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Seguridad:** el E-STOP de la app es un mensaje por Wi-Fi y **no** es un paro de seguridad. Durante toda la prueba,
alguien debe tener a mano el interruptor o el enchufe de la fuente de 12 V.

**Cómo hacerlo:**

1. Con la placa en Live (verificación 5), pulsar START y esperar a NORMAL con el ventilador girando.
2. Pulsar **E-STOP** (`btn-estop`, o la tecla E).
3. Comprobar en el banco que el relé CH2 hace clic, su LED se apaga y el ventilador se frena hasta pararse.
4. En la app: el estado pasa a CRITICAL con motivo ESTOP y el relé aparece abierto.
5. Esperar 15 s desde el disparo (la placa no mide la velocidad, así que el firmware espera a que el ventilador se
   detenga), hacer RESET → confirmar y comprobar que vuelve a OFF. Un RESET antes de 15 s debe rechazarse.
6. Repetir 3 veces y anotar el retraso aproximado entre pulsar el botón y el clic del relé.

**Aprobado si** el relé real se abre las 3 veces, en menos de 1 s aproximadamente.

### 3. B1 · El firmware real no lee el tacómetro y acepta RESET solo 15 s después del disparo

**Prioridad 1 (crítica).** El simulador y el puente ya siguen estas reglas (D-078). Si el firmware real no las
sigue, el puente descarta sus paquetes y el RESET se comporta distinto. Es requisito de las verificaciones 2 y 5.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que el firmware del equipo coincide con el del simulador:

- no hay entrada de tacómetro (el cable azul del ventilador queda libre) ni límite STALL;
- el paquete es del protocolo v2: `"v": 2` y **sin** campo `rpm` (el puente descarta los paquetes v1 o con `rpm`);
- el RESET se acepta solo **15 s o más** después del disparo; antes se rechaza con el log
  `WARN fsm: reset refused: wait 15 s after the trip`.

**Archivos de referencia:**

| Archivo                                        | Qué mirar                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/firmware/reference-cpp/state_machine.cpp` | `trip()` guarda `firmwareMs()`; `smCommandReset()` compara con `RESET_MIN_DELAY_MS` (15000) |
| `src/firmware/reference-cpp/main.cpp`          | `sendPacket()` (campos del paquete v2), `firmwareMs()`                                      |
| `public/schema/packet.schema.json`             | El formato exacto que valida el puente                                                      |
| `docs/PLAN.md` §7.4 y §10.1                    | Tabla de estados y protocolo                                                                |

**Cómo hacerlo:**

1. Revisar el código del firmware real contra los archivos anteriores. Lo esencial: guardar `millis()` en el
   disparo y comprobar `millis() - trippedAtMs >= 15000` al recibir RESET.
2. Con el puente en marcha (verificación 6), comprobar en http://localhost:8765/status que `invalid_up` sigue en 0
   mientras llegan paquetes.
3. En el banco: START, esperar a NORMAL y pulsar E-STOP. Pulsar RESET a los ~5 s: debe rechazarse (sigue en
   CRITICAL y el monitor serie muestra el WARN). Pulsar RESET otra vez pasados 15 s: debe pasar a OFF.
4. Comprobar a ojo que a los 15 s el ventilador está parado. Si sigue girando, hay que subir
   `firmware.resetMinDelay_s` en `src/shared/config.ts` y la constante del firmware a la vez, y registrarlo.

**Aprobado si** los paquetes no se descartan, el RESET temprano se rechaza y el de los 15 s se acepta.

### 4. P7.4 · La demo Línea base → Desequilibrio → Disparo → Reset cabe en 3 minutos

**Prioridad 1 (crítica).** La presentación depende de esta demo y tiene tiempo limitado.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Tiempo: ____

**Qué se comprueba:** que la demostración en vivo cabe en el tiempo de la presentación.

**Cómo hacerlo (con cronómetro):**

1. Abrir la app con la cámara general. Poner la velocidad (`sel-speed`) en 4× si se quiere acortar la espera.
2. **Línea base:** pulsar START, esperar a NORMAL y explicar los gráficos (puntaje bajo, persistencia 0/5).
3. **Desequilibrio:** subir `sld-imbalance` a 0.3 en M4 y mostrar cómo sube la vibración y el puntaje.
4. **Disparo:** esperar a CRITICAL, mostrar el relé abierto, el motivo del disparo (RCF) y la variable dominante
   (`a_rms_g`).
5. **Reset:** esperar 15 s desde el disparo, pulsar RESET → confirmar, volver a OFF y limpiar las
   fallas (`btn-clear-faults`).
6. Alternativa guiada: **Scenario → S2 imbalance** hace la misma secuencia sola.

**Aprobado si** la secuencia completa, con la explicación oral, dura 3 minutos o menos. Ensayarla al menos una vez
con la persona que presentará.

### 5. P8 · Los paquetes reales de la placa se muestran sin cambios fuera de `src/bridge/`

**Prioridad 1 (crítica).** Es la integración principal con el hardware (fase P8). Depende de las verificaciones 6 y 13.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Requisito:** firmware real cargado en el ESP32, basado en `src/firmware/reference-cpp/` y con las reglas de la
verificación 3 (protocolo v2, RESET a los 15 s). Debe enviar paquetes
JSON por UDP al puerto 4211 del portátil y escuchar en el 4210.

**Cómo hacerlo:**

1. Conectar la placa y el portátil a la misma red Wi-Fi. En el firmware, `LAPTOP_IP` debe ser la IP del portátil.
2. Arrancar el puente:

   ```bash
   bridge-py/.venv/bin/python bridge-py/app.py
   ```

   Si la placa no se detecta sola, añadir `--esp32-host <IP de la placa>`.

3. Comprobar en http://localhost:8765/status que el contador `packet` sube cada segundo y que `invalid_up` sigue en 0. Si sube `invalid_up`, el archivo de sesión `bridge-py/sessions/session-*.jsonl` indica qué campo falla. El protocolo es v2: `"v": 2` y sin campo `rpm` (verificación 3).
4. Abrir http://localhost:8765, elegir **Mode → Live** y comprobar que:
   - la vibración, la corriente, la temperatura y el estado coinciden con el banco real (la velocidad no se mide:
     las aspas siguen una estimación a partir del relé CH2 y el Inspector la marca como "estimated");
   - las aspas giran, el relé se mueve y el color de calor cambia;
   - los campos que la placa no envía muestran "—".
5. Comprobar con git que no hizo falta cambiar nada fuera de `src/bridge/`:

   ```bash
   git status --short
   ```

**Aprobado si** todo se muestra correctamente y los únicos cambios necesarios (si los hubo) están en `src/bridge/`.
Si el formato del paquete del firmware difiere del protocolo, se corrige el firmware, no la app.

### 6. P8.1 · El entorno de Python del puente se instala y funciona en el portátil del equipo

**Prioridad 1 (crítica).** Es requisito de las verificaciones 2 y 5, y se puede hacer ya con el ESP32 emulado.

- [ ] Hecho · Responsable: ____ · Sistema operativo: ____ · Python: ____ · Resultado: ____

**Qué se comprueba:** que el puente funciona en el portátil que se usará con la placa. Se puede hacer ya con el
ESP32 emulado.

**Archivo de referencia:** `bridge-py/README.md`.

**Linux / macOS:**

```bash
python3 -m venv bridge-py/.venv
```

```bash
bridge-py/.venv/bin/pip install -r bridge-py/requirements-dev.txt
```

```bash
pnpm build
```

```bash
bridge-py/.venv/bin/python -m pytest -q bridge-py/tests
```

**Windows (PowerShell):**

```powershell
py -3 -m venv bridge-py\.venv
```

```powershell
bridge-py\.venv\Scripts\pip install -r bridge-py\requirements-dev.txt
```

```powershell
pnpm build
```

```powershell
bridge-py\.venv\Scripts\python -m pytest -q bridge-py\tests
```

**Prueba completa con el ESP32 emulado.** En una terminal, arrancar el puente (en Windows, usar
`bridge-py\.venv\Scripts\python`):

```bash
bridge-py/.venv/bin/python bridge-py/app.py
```

En una segunda terminal, arrancar el ESP32 emulado:

```bash
bridge-py/.venv/bin/python bridge-py/fake_esp32.py --speed 4 --fault imbalance_g=0.3@60
```

Después:

1. Abrir http://localhost:8765, elegir **Mode → Live** y esperar el aviso verde.
2. Pulsar START, esperar NORMAL y luego CRITICAL (el desequilibrio entra a los 60 s simulados).
3. Esperar 15 s desde el disparo y hacer RESET.

En Windows, aceptar el aviso del firewall para el puerto UDP 4211 la primera vez.

**Aprobado si** `pytest` muestra `12 passed`, la secuencia START → NORMAL → CRITICAL → RESET → OFF funciona, y
http://localhost:8765/status muestra los contadores con `invalid_up` y `invalid_down` en 0.

### 7. P1.6 · Al menos 50 fps a 1920 × 1080 en un portátil con gráficos integrados

**Prioridad 1 (crítica).** Si la escena no va fluida en el portátil de la presentación, la demo se ve mal.

- [ ] Hecho · Responsable: ____ · Equipo (CPU/GPU): ____ · Navegador: ____ · fps medidos: ____

**Qué se comprueba:** la fluidez de la escena base. Se midieron 60 fps en Intel Iris Xe en Chromium headless; falta
confirmarlo en una ventana normal.

**Cómo hacerlo:**

1. Usar un portátil con gráficos integrados (Intel Iris/UHD o AMD Radeon integrada), enchufado a la corriente y en
   modo de energía "alto rendimiento".
2. Abrir el sitio publicado (o `pnpm preview`) en Chrome o Edge, en una ventana maximizada a 1920 × 1080 (o en
   pantalla completa con F11).
3. Pulsar START y esperar a NORMAL.
4. Leer el contador **fps** de la barra superior durante 30 s, o en la consola del navegador (con `?debug=1`):

   ```js
   window.__sim.fps;
   ```

   Opcionalmente, DevTools → More tools → Rendering → **Frame Rendering Stats** muestra el fps del navegador.

**Aprobado si** se mantiene en 50 fps o más. Si la pantalla va a 60 Hz, el máximo será 60.

---

## Prioridad 2 · Alta

### 8. P7.3 · Los textos de ayuda coinciden con el informe del proyecto

**Prioridad 2 (alta).** El informe se evalúa junto con la app: una terminología contradictoria resta puntos.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que la terminología de la app coincide con la del informe. Solo se pudo revisar contra
`docs/PLAN.md` §14 porque el informe no está en el repositorio.

**Archivos a revisar:**

| Archivo                    | Contenido                                                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| `src/ui/legend.ts`         | Glosario, colores de cables y de estados, atajos (lo que muestra la leyenda M12) |
| `src/shared/guided.ts`     | Texto de cada paso de los escenarios guiados (M11)                               |
| `src/shared/components.ts` | Nombres y especificaciones de cada pieza (Inspector M9)                          |
| `docs/PLAN.md` §14         | Glosario de referencia                                                           |

**Cómo hacerlo:**

1. Tener a mano el informe final del grupo.
2. Leer los archivos anteriores, o en la app: abrir la leyenda (`?`), pasar el ratón sobre las piezas y botones
   para ver los tooltips y recorrer los escenarios guiados S1, S2, S4, S5, S6 y S9.
3. Anotar cada término que difiera del informe (nombres de estados, variables como `a_rms_g` o `cf`, umbrales,
   nombres de componentes, unidades).

**Aprobado si** no hay contradicciones con el informe. Las diferencias de redacción se corrigen en los archivos
indicados. Los valores numéricos solo se cambian en `src/shared/config.ts`.

### 9. P6 · Las animaciones muestran causa y efecto a quien no leyó el informe

**Prioridad 2 (alta).** Es el objetivo didáctico del simulador: explicar el mantenimiento predictivo con la imagen.

- [ ] Hecho · Responsable: ____ · Participante: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que las animaciones explican por sí solas qué pasa en el banco.

**Archivos de referencia:** `docs/screenshots/p6/`, con los 6 pasos del escenario guiado S2 (`s2-step1-t7.6s.jpg` a
`s2-step6-t120.0s.jpg`).

**Cómo hacerlo:**

1. Con alguien que no haya leído el informe, abrir la app y elegir **Scenario → S2 imbalance** en la barra superior.
   Se abre la tarjeta guiada (M11), que avanza sola.
2. Pausar en cada paso y pedirle que explique con sus palabras qué está pasando y por qué. Por ejemplo: "el
   ventilador vibra más", "el puntaje del modelo sube", "el relé se abre y el ventilador se frena".
3. Comparar sus respuestas con el texto de cada paso (`src/shared/guided.ts`).

**Aprobado si** identifica la cadena completa: desequilibrio → más vibración → puntaje alto del RCF → CRITICAL →
relé abierto → el ventilador se detiene.

### 10. B7 · El GY-521 está montado como en el 3D: fijo a la carcasa, de pie en el plano del ventilador

**Prioridad 2 (alta).** El modelo de vibración supone esa orientación (X e Y en el plano del ventilador, Y hacia
arriba, Z a lo largo del eje). Si el montaje real es otro, hay que cambiar el modelo, no solo el dibujo (D-084).

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que la placa está rígidamente fijada a la carcasa (pegada o atornillada, sin cinta que vibre),
con la orientación del 3D, y que su conexión es la del documento: VCC al riel de 3V3, SDA y SCL por A45/B45 y
A46/B46, y XDA, XCL, AD0 e INT libres (dirección 0x68).

**Cómo hacerlo:**

1. En la app, cámara **Fan** (tecla 2): la placa azul está de pie sobre el borde superior del marco, con el conector
   de 8 pines arriba y las flechas X (derecha) e Y (arriba) impresas. Comparar con el banco real.
2. Con el ventilador parado, leer el acelerómetro con este sketch (o con el firmware real por el monitor serie):

   ```cpp
   #include <Wire.h>
   void setup() {
     Serial.begin(115200); Wire.begin(21, 22);
     Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();
   }
   void loop() {
     Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false);
     Wire.requestFrom(0x68, 6);
     int16_t x = (Wire.read() << 8) | Wire.read(), y = (Wire.read() << 8) | Wire.read(), z = (Wire.read() << 8) | Wire.read();
     Serial.printf("x=%.2f y=%.2f z=%.2f g\n", x / 16384.0, y / 16384.0, z / 16384.0);
     delay(500);
   }
   ```

3. Lo esperado: x ≈ 0, **y ≈ +1 g**, z ≈ 0 (± 0,1 g).
4. Si la gravedad cae en Z (placa tumbada) o Y sale negativa (placa al revés), anotar cómo está montada y avisar:
   habrá que cambiar el mapeo de ejes en `src/sim/vibration.ts` y el modelo 3D.

**Aprobado si** la placa está fija, con y ≈ +1 g en reposo, y conectada como en el documento.

### 11. B5 · La protoboard 3D coincide agujero por agujero con el documento de cableado

**Prioridad 2 (alta).** Es el objetivo de los últimos cambios: que el simulador sea el banco real. Incluye una
suposición que solo el equipo puede confirmar: dónde está el ESP32.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** los 26 cables (W01–W26), las 4 resistencias de 10 kΩ y la posición del ESP32 (D-082).

**Archivos:** la tabla de `docs/PLAN.md` §13.3 (mismo orden y notación que el documento: `bb.A25` = columna A,
fila 25), `src/shared/wiring.ts` y el documento de cableado del equipo.

**Cómo hacerlo:**

1. Imprimir la tabla de §13.3 y repasarla línea a línea contra el documento del equipo: origen, destino y agujero.
2. En la app, cámara **Breadboard** (tecla 5), con **Labels** activado. Hacer clic en la protoboard y en cada
   resistencia: el Inspector (M9) muestra sus cables. Comprobar las filas 18, 19, 25, 30, 35, 45 y 46:
   - fila 25 (5 V): VIN en A25, VCC del ACS712 en B25, VCC del relé en C25;
   - DS18B20: amarillo en D18, B18 → D4, 10 kΩ de A18 y de A19 al riel de 3V3, puente C18–C19;
   - ACS712: OUT en A30, 10 kΩ B30–B35, 10 kΩ C35 → riel GND, D35 → D34;
   - MPU6050: SDA en A45 y B45 → D21; SCL en A46 y B46 → D22.
3. Rieles: el rojo izquierdo es 3V3 y el azul izquierdo GND (todas las masas); los rieles derechos no se usan; no
   hay cable del − de 12 V a la protoboard (sin masa común).
4. Libres: el cable azul del ventilador, IN1 y NC2 del relé, el jumper JD-VCC puesto, y XDA, XCL, AD0 e INT del
   GY-521.
5. **ESP32:** en el 3D está fuera de la protoboard, en la mesa detrás de las columnas A–E, con el USB-C hacia el
   portátil (no cabe en la protoboard sin tapar esas filas). Si en el banco real está en otro sitio (otra
   protoboard, otra orientación), anotar dónde.
6. La prueba automática de la lista:

   ```bash
   pnpm vitest run tests/unit/shared/wiring.test.ts
   ```

**Aprobado si** todas las líneas coinciden con el documento y el ESP32 está donde el 3D lo pone. Cada diferencia
se anota con el ID del cable (por ejemplo `W14`).

### 12. P5.G · Un compañero provoca una falla y hace un reset sin instrucciones

**Prioridad 2 (alta).** Mide si la app se entiende sin explicaciones, como la verá el jurado.

- [ ] Hecho · Responsable: ____ · Participante: ____ · Fecha: ____ · Tiempo: ____ · Resultado: ____

**Qué se comprueba:** que la interfaz se entiende sin ayuda.

**Cómo hacerlo:**

1. Elegir a un compañero que no haya usado la app.
2. Darle solo la URL del sitio publicado y esta consigna: _"Arranca el ventilador, provoca un desequilibrio hasta que
   el sistema corte la alimentación y luego deja el sistema otra vez apagado y listo."_
3. No responder preguntas ni señalar controles. Observar y anotar dónde duda o se equivoca.
4. Detenerse cuando el sistema vuelva a OFF tras el RESET confirmado, o a los 10 minutos.

**Aprobado si** completa START → falla → CRITICAL → RESET → OFF sin ayuda. Cada duda anotada es una mejora posible
de la interfaz, aunque la verificación se apruebe.

### 13. P3.7 · El C++ de referencia parece código Arduino plausible para ESP32

**Prioridad 2 (alta).** Es la base del firmware real: sus errores retrasan las verificaciones 2 y 5.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que el código de `src/firmware/reference-cpp/` sirve como base realista del firmware real.

**Archivos:** `main.cpp` (lectura de sensores, ventana de 1 s, Wi-Fi/UDP), `state_machine.cpp`, `features.cpp`,
`relay.cpp`.

**Cómo hacerlo:**

1. Revisar que los pines coinciden con el cableado real:

   | Señal                                  | Pin                                    |
   | -------------------------------------- | -------------------------------------- |
   | MPU6050 (I²C, 400 kHz)                 | SDA GPIO21, SCL GPIO22, dirección 0x68 |
   | DS18B20 (pull-up 2 × 10 k en paralelo) | GPIO4                                  |
   | ACS712 (divisor 10 k / 10 k)           | GPIO34 (ADC1)                          |
   | Tacómetro                              | sin conectar (cable azul libre)        |
   | Relé CH2 (módulo a 5 V, jumper puesto) | GPIO26 → IN2 (activo en bajo)          |

2. Revisar que las bibliotecas existen y son las habituales: `ArduinoJson`, `OneWire`, `DallasTemperature`, `Wire`,
   `WiFi`, `WiFiUdp` (núcleo Arduino-ESP32 3.x). Ya no se usa el contador de pulsos (PCNT): no hay tacómetro.
3. Intentar compilarlo en el Arduino IDE (o con `arduino-cli`) para la placa "ESP32 Dev Module", con las bibliotecas
   anteriores instaladas. Hay que definir antes `WIFI_SSID`, `WIFI_PASSWORD` y `LAPTOP_IP`.
4. Comprobar que los comentarios `// @map ...` aparecen en las mismas transiciones que en `src/firmware/*.ts`.
5. Las reglas nuevas del banco real (sin tacómetro, protocolo v2, RESET a los 15 s) se comprueban en la
   verificación 3.

**Aprobado si** un miembro del equipo con experiencia en ESP32 lo considera razonable. Lo ideal es que compile; los
errores de compilación se anotan como issues.

### 14. P6 · Al menos 50 fps a 1920 × 1080 con todos los conmutadores de vista activos

**Prioridad 2 (alta).** Es el caso más exigente; importa si en la demo se mostrarán todas las capas a la vez.

- [ ] Hecho · Responsable: ____ · Equipo: ____ · fps medidos: ____

**Qué se comprueba:** el caso más exigente. El contenedor de desarrollo no tiene GPU (2 a 5 fps), así que hay que
medirlo en el portátil del equipo.

**Cómo hacerlo:**

1. Usar la misma preparación que en la verificación 7.
2. Activar **Flow**, **Labels**, **Airflow**, **Heat** y **Sound**, y subir el deslizador de exageración de
   vibración (`sld-vib-exaggeration`).
3. Pulsar START, esperar a NORMAL e inyectar desequilibrio 0.3 en M4 para que haya vibración, pulsos de datos y
   cambios de color.
4. Mirar el contador **fps** durante 30 s, incluido el momento del CRITICAL.

**Aprobado si** se mantiene en 50 fps o más durante toda la secuencia.

---

## Prioridad 3 · Media

### 15. P5.1 · La interfaz se lee bien a 1280 × 720 y a 1920 × 1080

**Prioridad 3 (media).** Las capturas ya muestran una interfaz razonable; falta confirmarlo en los monitores reales.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** la legibilidad y el orden de la interfaz en las dos resoluciones objetivo.

**Archivos de referencia:** `docs/screenshots/p5/`, con capturas en los estados OFF, NORMAL, WARNING y CRITICAL a
ambas resoluciones (`off-1280x720.jpg`, `normal-1920x1080.jpg`, etc.).

**Cómo hacerlo:**

1. Revisar las 8 capturas.
2. Abrir la app en el navegador a cada resolución. En Chrome se puede usar DevTools → Toggle device toolbar
   (Ctrl+Shift+M) con tamaño 1280 × 720 y luego 1920 × 1080.
3. Llevar el sistema por OFF → NORMAL (START) → WARNING y CRITICAL (inyectar desequilibrio 0.3 en M4).
4. Comprobar que ningún texto se corta ni se superpone, que los botones se distinguen y que los estados se leen de un
   vistazo.
5. A 1280 × 720, comprobar que la columna izquierda (fallas y operador) se desplaza con la rueda del ratón y que se
   llega hasta el último control.

**Aprobado si** todo es legible sin hacer zoom a ambas resoluciones y la columna izquierda se desplaza a 720 px.

### 16. P1.2 · Cada pieza se reconoce junto a su foto

**Prioridad 3 (media).** Da credibilidad al modelo, pero no afecta al funcionamiento.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que cada componente 3D se parece a la pieza real del banco.

**Archivos:** `assets/photos/` contiene `fan.jpg`, `fan-closeup.png`, `esp32.jpg`, `relay.jpg`, `relay-closeup.png`,
`acs712.jpg`, `ds18b20.jpg`, `breadboard.jpg` y `adapter.jpg`. No hay foto del GY-521: su modelo se construyó a partir
de la descripción del equipo (placa azul de 21 × 16 mm, 8 pines, flechas X/Y); compararlo con la placa real. La geometría de cada pieza está descrita en
`docs/PLAN.md` §13.2 y se construye en `src/scene/models/`.

**Cómo hacerlo:**

1. Abrir la app.
2. Hacer clic en cada pieza (ventilador, ESP32, relé, ACS712, DS18B20, protoboard, adaptador). El Inspector (M9)
   muestra la foto de esa pieza junto a sus datos.
3. Usar las cámaras `cam-fan`, `cam-esp32`, `cam-relay` y `cam-breadboard` (teclas 1 a 5) para verlas de cerca.
4. Para cada pieza, comparar forma, proporciones, colores, rótulos, número y posición de pines y color de cables con
   la foto.

**Aprobado si** alguien del equipo puede nombrar cada pieza mirando solo el modelo 3D, y ningún detalle visible
(color del PCB, posición del conector, número de pines) contradice la foto. Anotar cualquier diferencia como issue
con el nombre de la pieza.

### 17. P7.4 · Primera carga en menos de 4 s con una conexión normal

**Prioridad 3 (media).** Afecta a la primera impresión del sitio publicado; para la demo se puede abrir con antelación.

- [ ] Hecho · Responsable: ____ · Conexión: ____ · Tiempo medido: ____

**Qué se comprueba:** el tiempo de carga del sitio publicado.

**Cómo hacerlo:**

1. Abrir Chrome en una ventana de incógnito (sin caché).
2. Abrir DevTools → pestaña **Network**, marcar **Disable cache** y dejar el throttling en **No throttling** (o
   **Fast 4G** para simular una conexión normal de móvil).
3. Abrir https://creeplyndarker.github.io/3D-SIMULATOR-IOT/.
4. Anotar el valor **Load** de la barra inferior de Network y comprobar que la escena se ve y el estado del modelo
   (`model-status`) muestra READY.
5. Opcionalmente, DevTools → **Lighthouse** → Performance → Analyze, y anotar el "Largest Contentful Paint".
6. Repetir 3 veces y anotar la mediana.

**Aprobado si** la mediana es menor de 4 s y la app queda usable (escena visible y modelo READY) dentro de ese
tiempo.

### 18. P8.4 · `pnpm calibrate` da valores plausibles con una grabación real

**Prioridad 3 (media).** Mejora la fidelidad del simulador; es opcional y requiere la placa y 11 minutos de grabación.

- [ ] Hecho · Responsable: ____ · Archivo de sesión: ____ · Resultado: ____

**Qué se comprueba:** que la calibración ajusta el modelo del simulador al banco real con valores razonables.

**Cómo grabar la sesión** (protocolo `CALIBRATION_SCENARIO`, en `src/shared/calibration.ts`):

1. Dejar el ventilador apagado al menos 15 minutos para que esté a temperatura ambiente.
2. Arrancar el puente. Cada arranque crea un archivo nuevo en `bridge-py/sessions/`.
3. Con la placa enviando paquetes y el ventilador quieto, esperar **10 s**.
4. Pulsar **START** y dejarlo funcionando **10 minutos**, sin tocar nada ni mover el banco.
5. Pulsar **E-STOP** y esperar **30 s** más con el ventilador parado.
6. Detener el puente (Ctrl+C).

**Cómo calibrar:**

```bash
pnpm calibrate bridge-py/sessions/session-AAAAMMDD-HHMMSS.jsonl
```

El script imprime una tabla con el valor actual, el propuesto, el cambio en % y de qué parte de la grabación sale
cada uno. Escribe además `bridge-py/sessions/session-AAAAMMDD-HHMMSS.config.diff`. **Nunca** modifica
`src/shared/config.ts` por sí solo.

Para ver que la herramienta funciona antes de usar la placa, se puede probar con una grabación simulada:

```bash
pnpm calibrate --record prueba.jsonl --set fan.residualUnbalance_gmm=2.6
```

```bash
pnpm calibrate prueba.jsonl
```

**Cómo revisar:**

1. Comparar los valores propuestos con la realidad:
   - la velocidad (`fan.rpmRated`, `fan.tauUp_s`, `fan.tauDown_s`) no se calibra: el banco no tiene sensor de
     velocidad;
   - `thermal.ambient_C` ≈ temperatura de la sala;
   - `fan.iIdle_A` + `fan.iAero_A` ≈ corriente medida con un multímetro;
   - los ruidos de sensor deben estar en el mismo orden de magnitud que los actuales.
2. Las líneas marcadas con ⚠ están fuera del rango de ajuste de `docs/PLAN.md` §5.2 y hay que discutirlas en equipo
   antes de aceptarlas.
3. Si son razonables, aplicar el diff y verificar que todo sigue pasando:

   ```bash
   git apply --check bridge-py/sessions/session-AAAAMMDD-HHMMSS.config.diff
   ```

   ```bash
   git apply bridge-py/sessions/session-AAAAMMDD-HHMMSS.config.diff
   ```

   ```bash
   pnpm verify
   ```

4. Como los parámetros cambian, puede ser necesario regenerar el modelo y los fixtures (`pnpm gen:model`,
   `pnpm gen:fixtures`) y volver a pasar `pnpm test:e2e`. Registrar el cambio en `docs/DECISIONS.md`.

**Aprobado si** los valores son físicamente plausibles, `pnpm verify` pasa con la configuración nueva y el equipo
acepta el cambio en `docs/DECISIONS.md`.

---

## Prioridad 4 · Baja

### 19. P1.3 · La disposición parece un banco de laboratorio ordenado

**Prioridad 4 (baja).** Es una impresión general de aspecto: cosmética.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** la impresión general de la escena.

**Cómo hacerlo:**

1. Abrir la app con la cámara `cam-overview` (tecla 1).
2. Girar la cámara alrededor de la mesa con el ratón y comparar con el banco real del grupo (o con su foto, si
   existe).
3. Recordar que el ESP32 está fuera de la protoboard, detrás de ella (verificación 11). Comprobar que las piezas están alineadas, separadas de forma razonable y apoyadas sobre la mesa (nada flotando ni
   hundido), que los cables siguen recorridos plausibles y que la escala de cada pieza es coherente con las demás.

**Aprobado si** la escena se reconoce como el banco del grupo y no hay piezas mal escaladas, flotando o
superpuestas.

### 20. P1.4 · Ningún cable atraviesa un componente

**Prioridad 4 (baja).** Ya está cubierta en parte por una prueba automática.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que los cables rodean las piezas en lugar de atravesarlas. Hay una prueba automática que lo
cubre en parte, pero se pide una revisión visual.

**Prueba automática que lo cubre en parte:**

```bash
pnpm vitest run tests/unit/scene/route.test.ts
```

**Archivos:** recorridos de cables en `src/shared/wiring.ts` (tabla de `docs/PLAN.md` §13.3).

**Cómo hacerlo:**

1. Activar el conmutador **Labels** (`tgl-labels`) para ver el nombre de cada cable.
2. Recorrer la escena desde varios ángulos, especialmente alrededor de la protoboard, el ESP32 y el relé.
3. Acercar la cámara a cada cruce entre un cable y una pieza.

**Aprobado si** ningún cable entra en el volumen de una pieza (salvo en su pin de destino). Anotar el ID del cable
(por ejemplo `W04`) si alguno lo hace.

### 21. P6.3/P6.4 · El clic del relé y el zumbido del ventilador suenan bien

**Prioridad 4 (baja).** El sonido está silenciado por defecto y es opcional.

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que los sonidos son creíbles y no molestan. Por defecto el sonido está silenciado.

**Cómo hacerlo:**

1. Usar auriculares o altavoces a volumen moderado.
2. Activar el conmutador **Sound** (`tgl-sound`) abajo a la derecha del visor.
3. Pulsar START: el relé debe hacer clic al cerrarse y el zumbido debe subir de tono al acelerar el ventilador.
4. Inyectar desequilibrio 0.3: el zumbido debe cambiar con la vibración.
5. Al llegar a CRITICAL, el relé debe hacer clic al abrirse y el zumbido debe bajar hasta apagarse.
6. Pausar (Espacio): el sonido debe callarse.
7. Si es posible, comparar con el sonido del ventilador y del relé reales.

**Aprobado si** los sonidos coinciden con los eventos y no hay chasquidos, cortes ni volumen excesivo.

---

## Otros pendientes (no son verificaciones humanas)

Trabajo que falta para cerrar el proyecto y que no es una casilla de las verificaciones anteriores.

### Del equipo

| #   | Pendiente                                            | Detalle                                                                                                                                                                                                        | Bloquea                     |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| A1  | Escribir y cargar el firmware real del ESP32         | Partir de `src/firmware/reference-cpp/` (no se compila en CI). Debe seguir el protocolo v2 y la regla de RESET a los 15 s (verificación 3). Definir `WIFI_SSID`, `WIFI_PASSWORD` y `LAPTOP_IP`.                | Verificaciones 2, 3, 5 y 18 |
| A2  | Confirmar OPEN-2: variante del ACS712                | Se supone la de 5 A (0,185 V/A). Leer el chip: `ACS712ELCTR-05B` = 5 A, `-20A` = 20 A (0,100 V/A), `-30A` = 30 A (0,066 V/A). Si no es 5 A, cambiar `sensors.acs712.sens_VperA` y regenerar modelo y fixtures. | Lectura de corriente real   |
| A3  | Confirmar OPEN-6: conexión del adaptador de 12 V     | Se supone un jack hembra de 5,5 × 2,1 mm con bornes de tornillo. Si es otra cosa, solo cambia el 3D.                                                                                                           | Fidelidad del 3D            |
| A4  | Confirmar OPEN-7: número de aspas                    | Se suponen 7 (contarlas en el ventilador real). Cambia la frecuencia de paso de aspas en la vibración y el 3D.                                                                                                 | Fidelidad de la vibración   |
| A5  | Foto del GY-521 (opcional)                           | No hay foto: el modelo es procedural. Con una foto en `assets/photos/` se puede texturizar como las demás piezas.                                                                                              | Nada                        |
| A6  | Revisar el riesgo del relé a 5 V con lógica de 3,3 V | Si la verificación 1 falla, cambiar el apagado de IN2 a entrada o drenador abierto en `relay.cpp` y en el firmware real.                                                                                       | Verificación 2              |
| A7  | Calibrar con una grabación real                      | Tras A1: grabar la sesión de calibración y aplicar el diff si es razonable (verificación 18).                                                                                                                  | Fidelidad del modelo        |
| A8  | Tareas `[human]` de `docs/PROGRESS.md`               | Al firmar cada verificación de este documento, cerrar también su línea en "Waiting for human review" de `docs/PROGRESS.md`.                                                                                    | Seguimiento                 |

### Del repositorio

| #   | Pendiente                                                 | Detalle                                                                                                                                                                                        |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Revisar y fusionar la rama `claude/real-bench-wiring`     | Contiene los cambios B1–B7 (un commit por punto, más un ajuste de la leyenda). No está fusionada en `main`: abrir el pull request, esperar a que pasen `CI / verify` y `CI / e2e`, y fusionar. |
| R2  | Una pasada completa de `pnpm test:e2e` sin interrupciones | Cada prueba pasó al menos una vez sobre el código final, pero la pasada completa se cortó por un reinicio del contenedor. El CI del pull request la hará entera.                               |
| R3  | Publicar la versión nueva                                 | Al fusionar en `main`, GitHub Pages se actualiza solo (`.github/workflows/deploy.yml`). Comprobar después el sitio (verificación 17).                                                          |

---

## Resumen de verificaciones

| #   | Prioridad   | ID        | Verificación                                | Requiere                    | Estado |
| --- | ----------- | --------- | ------------------------------------------- | --------------------------- | ------ |
| 1   | 1 · Crítica | B3        | El relé se suelta con IN2 en 3,3 V          | Placa + relé + sketch       | ☐      |
| 2   | 1 · Crítica | P8        | E-STOP abre el relé real                    | Placa + firmware            | ☐      |
| 3   | 1 · Crítica | B1        | Firmware: sin tacómetro, v2, RESET 15 s     | Placa + firmware            | ☐      |
| 4   | 1 · Crítica | P7.4      | Demo en ≤ 3 minutos                         | Cronómetro                  | ☐      |
| 5   | 1 · Crítica | P8        | Paquetes reales se muestran                 | Placa + firmware            | ☐      |
| 6   | 1 · Crítica | P8.1      | Puente instalado y funcionando              | Portátil + Python           | ☐      |
| 7   | 1 · Crítica | P1.6      | ≥ 50 fps con gráficos integrados            | Portátil del equipo         | ☐      |
| 8   | 2 · Alta    | P7.3      | Textos coherentes con el informe            | Informe final               | ☐      |
| 9   | 2 · Alta    | P6        | Las animaciones muestran causa y efecto     | Una persona ajena           | ☐      |
| 10  | 2 · Alta    | B7        | GY-521 fijo y de pie, y ≈ +1 g              | Placa + sketch              | ☐      |
| 11  | 2 · Alta    | B5        | Protoboard 3D = documento de cableado       | Documento de cableado       | ☐      |
| 12  | 2 · Alta    | P5.G      | Falla y reset sin instrucciones             | Un compañero                | ☐      |
| 13  | 2 · Alta    | P3.7      | C++ plausible para ESP32                    | Arduino IDE (opcional)      | ☐      |
| 14  | 2 · Alta    | P6        | ≥ 50 fps con todos los conmutadores         | Portátil del equipo         | ☐      |
| 15  | 3 · Media   | P5.1      | Interfaz legible a 1280 × 720 y 1920 × 1080 | Navegador                   | ☐      |
| 16  | 3 · Media   | P1.2      | Piezas reconocibles junto a su foto         | Navegador                   | ☐      |
| 17  | 3 · Media   | P7.4      | Primera carga < 4 s                         | Navegador + red             | ☐      |
| 18  | 3 · Media   | P8.4      | Calibración plausible                       | Placa + 11 min de grabación | ☐      |
| 19  | 4 · Baja    | P1.3      | Banco de laboratorio ordenado               | Navegador                   | ☐      |
| 20  | 4 · Baja    | P1.4      | Ningún cable atraviesa una pieza            | Navegador                   | ☐      |
| 21  | 4 · Baja    | P6.3/P6.4 | Sonidos del relé y del ventilador           | Auriculares                 | ☐      |
