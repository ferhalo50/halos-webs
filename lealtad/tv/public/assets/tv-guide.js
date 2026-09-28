(() => {
  'use strict';

  const guides = {
    viewer: ['Guía de Renace Café TV', [
      ['Selecciona el contenido', 'Elige una o varias tarjetas de la biblioteca. Usa “Seleccionar todo” para marcar la lista completa y “Limpiar selección” para empezar de nuevo.'],
      ['Reproduce fotos y videos', 'Pulsa “Reproducir selección” para mostrar solamente lo elegido o “Reproducir todo” para usar la biblioteca activa completa. Las fotos avanzan automáticamente y cada video se reproduce completo.'],
      ['Actualiza la biblioteca', 'Pulsa “Actualizar contenido” después de hacer cambios en el administrador. La pantalla conservará las selecciones que todavía existan y mostrará la nueva biblioteca sin recargar toda la página.'],
      ['Presentación y pantalla completa', 'Al iniciar, Renace TV intenta abrir la presentación en pantalla completa. Usa ← y → para cambiar, Atrás o Escape para salir y, en una pantalla táctil, toca dos veces. Durante la presentación solamente se muestra la foto o el video.'],
      ['Prepara contenido sin conexión', 'Selecciona contenido y pulsa “Preparar sin conexión”; si no seleccionas nada, se prepara la biblioteca completa. Espera el mensaje “Listo para usar sin conexión” antes de desconectar el dispositivo.'],
      ['Entra al administrador', 'Pulsa “Iniciar sesión” en la parte superior para abrir el panel protegido. Ahí puedes subir, ordenar, activar o retirar contenido de la pantalla.']
    ]],
    admin: ['Guía de administración', [
      ['Sube una foto o video', 'Pulsa “Seleccionar archivo”, elige el contenido y después “Subir contenido”. Mantén esta página abierta hasta que aparezca “Contenido subido correctamente”.'],
      ['Usa formatos compatibles', 'Puedes subir JPG, JPEG, PNG, WebP y MP4 de hasta 95 MB por archivo. Para una reproducción confiable en TV recomendamos video MP4 con codificación H.264. HEIC, HEIF y MOV deben convertirse antes.'],
      ['Activa o desactiva contenido', 'El contenido activo aparece en la pantalla de TV. “Desactivar” lo oculta sin borrar el archivo; puedes volver a activarlo cuando quieras. En la TV, pulsa “Actualizar contenido” para ver el cambio.'],
      ['Cambia el orden', 'Usa las flechas ↑ y ↓ de cada elemento para moverlo. En computadora también puedes arrastrar las filas. El orden guardado es el que utiliza “Reproducir todo”.'],
      ['Elimina con cuidado', '“Eliminar” quita el elemento de la biblioteca después de pedir confirmación. Revisa el nombre y la vista previa antes de continuar, porque el archivo tendrá que volver a subirse si lo necesitas otra vez.'],
      ['Consulta el almacenamiento', 'La barra “Espacio para nuevas subidas” muestra cuánto espacio se está utilizando y cuánto queda disponible. El tamaño de cada archivo aparece junto a su nombre.'],
      ['Vuelve a la pantalla de TV', 'Pulsa el logotipo Renace TV de la esquina superior izquierda para regresar al reproductor. Después usa “Actualizar contenido” para cargar los cambios más recientes.']
    ]]
  };

  function openGuide(kind, trigger) {
    const selected = guides[kind];
    if (!selected) return;
    document.querySelector('.tv-guide[open]')?.close();
    const [title, sections] = selected;
    const dialog = document.createElement('dialog');
    dialog.className = 'tv-guide';
    dialog.setAttribute('aria-labelledby', 'tv-guide-title');
    const header = document.createElement('header');
    header.className = 'tv-guide-header';
    const heading = document.createElement('h2');
    heading.id = 'tv-guide-title';
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tv-guide-close';
    close.textContent = 'Cerrar ✕';
    close.onclick = () => dialog.close();
    header.append(heading, close);
    const content = document.createElement('div');
    content.className = 'tv-guide-content';
    content.tabIndex = 0;
    content.setAttribute('aria-label', 'Contenido de la guía');
    sections.forEach(([label, description], index) => {
      const section = document.createElement('section');
      section.dataset.step = String(index + 1).padStart(2, '0');
      const subheading = document.createElement('h3');
      subheading.textContent = label;
      const paragraph = document.createElement('p');
      paragraph.textContent = description;
      section.append(subheading, paragraph);
      content.append(section);
    });
    dialog.append(header, content);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === close ? content : close).focus();
      }
      if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        content.focus({ preventScroll: true });
        content.scrollBy({ top: event.key.includes('Down') ? 180 : -180, behavior: 'smooth' });
      }
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-tv-guide]');
    if (trigger) openGuide(trigger.dataset.tvGuide, trigger);
  });
})();
