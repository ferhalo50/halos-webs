export function formatBytes(bytes) {
  if(!Number.isFinite(bytes))return 'Tamaño no disponible';
  if(bytes<1000)return `${bytes} B`;
  const units=['KB','MB','GB'];let value=bytes/1000,index=0;
  while(value>=1000&&index<2){value/=1000;index++;}
  return `${value.toLocaleString('es-MX',{maximumFractionDigits:1})} ${units[index]}`;
}
export function renderStorage(panel,storage) {
  if(!panel)return;
  const summary=panel.querySelector('[data-storage-summary]');
  const detail=panel.querySelector('[data-storage-detail]');
  const track=panel.querySelector('[role=progressbar]');
  const bar=panel.querySelector('[data-storage-bar]');
  panel.classList.remove('warning','critical','full','over');
  if(!storage?.limitBytes) {
    summary.textContent='Almacenamiento no disponible';detail.textContent='Actualiza cuando haya conexión. No se muestran cifras estimadas.';
    track.removeAttribute('aria-valuenow');bar.style.width='0%';return;
  }
  const percent=Math.min(100,Math.max(0,storage.percent||0));
  panel.dataset.limitBytes=String(storage.limitBytes);panel.dataset.usedBytes=String(storage.usedBytes);
  if(['warning','critical','full','over'].includes(storage.state))panel.classList.add(storage.state);
  bar.style.width=`${percent}%`;track.setAttribute('aria-valuenow',String(percent));
  summary.textContent=`${formatBytes(storage.usedBytes)} utilizados de ${formatBytes(storage.limitBytes)}`;
  const reserved=storage.reservedBytes?` · ${formatBytes(storage.reservedBytes)} en subidas pendientes`:'';
  detail.textContent=storage.overBytes>0
    ? `${storage.percent}% utilizado · Exceso: ${formatBytes(storage.overBytes)}. Tus archivos siguen disponibles; libera espacio antes de subir más.`
    : `${formatBytes(storage.availableBytes??Math.max(0,storage.limitBytes-storage.usedBytes))} disponibles · ${percent}% utilizado${reserved}`;
  if(!navigator.onLine)detail.textContent+=' · Sin conexión: último dato guardado.';
}
