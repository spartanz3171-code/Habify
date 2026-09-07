* Documento de Arquitectura y Requerimientos: App de Hábitos RPG**

**Objetivo del Proyecto:** Crear una aplicación web interactiva que gamifique la creación de hábitos. Los usuarios tendrán un Avatar que sube de nivel, gana monedas y combate, basándose en el cumplimiento de sus hábitos diarios reales.

**1\. Modelos de Datos (Base de Datos)**

El agente debe estructurar el backend y la base de datos con las siguientes entidades principales:

* **Usuario/Avatar:**  
  * nombre\_avatar (String)  
  * nivel (Integer, inicia en 1\)  
  * experiencia\_actual (Integer)  
  * experiencia\_para\_nivel (Integer)  
  * monedas\_oro (Integer)  
  * puntos\_de\_vida\_hp (Integer, máximo 100\)  
* **Hábito:**  
  * titulo (String)  
  * tipo (Enum: Positivo, Negativo a evitar)  
  * recompensa\_xp (Integer)  
  * penalizacion\_hp (Integer, solo para hábitos negativos)  
  * estado\_diario (Boolean: Completado/Pendiente)  
* **Inventario/Tienda:**  
  * item\_id (String)  
  * nombre\_item (String \- Ej: "Fondo de París", "Mascota Mini T-Rex", "Espada de Madera")  
  * costo\_monedas (Integer)

**2\. Requerimientos de Interfaz de Usuario (Frontend)**

El agente debe generar las siguientes vistas usando componentes modernos y responsivos:

* **Vista Principal (Dashboard):** \* Parte superior: Renderizar el Avatar del usuario, una barra de progreso de Experiencia (XP) y una barra de Vida (HP).  
  * Parte inferior: Lista de hábitos del día con *checkboxes* para marcarlos como completados.  
* **Vista de Gestión de Hábitos:**  
  * Un formulario para agregar hábitos nuevos.  
  * Debe incluir un botón para "Cargar Hábitos por Defecto" que inserte automáticamente: "Beber 2L de agua", "Hacer 30 min de ejercicio" y "Practicar inglés".  
* **Vista de Tienda:**  
  * Un catálogo visual con tarjetas (*cards*) donde el usuario pueda gastar su oro en cosméticos o fondos para su avatar (ej. fondos de paisajes como Tokio).  
* **Vista de Arena (Combate):**  
  * Una pantalla dividida: Avatar del usuario vs. Avatar oponente.  
  * Un botón de "Iniciar Batalla" que calcule al ganador basándose en el nivel y XP acumulado.

**3\. Fases de Ejecución para el Agente**

Por favor, ejecuta este proyecto en el siguiente orden, esperando mi validación entre cada paso:

1. **Fase 1 \- Esqueleto:** Configura la estructura base del proyecto web (HTML/CSS/JavaScript o el framework de tu elección) y crea el modelo de datos básico en memoria.  
2. **Fase 2 \- Motor de Hábitos:** Crea la lógica para que al marcar un hábito positivo suba la barra de XP, y al fallar uno negativo baje el HP.  
3. **Fase 3 \- Interfaz Visual:** Aplica estilos CSS para que tenga una estética de videojuego RPG.  
4. **Fase 4 \- Simulador de Batalla:** Implementa el algoritmo matemático para las batallas entre avatares.

