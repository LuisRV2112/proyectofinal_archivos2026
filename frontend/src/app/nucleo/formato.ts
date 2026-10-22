import { Pipe, PipeTransform } from '@angular/core';

/** 1536 -> "1.5 KB". La API entrega bytes crudos; la interfaz nunca los muestra asi. */
export function formatearBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(valor < 10 ? 1 : 0)} ${unidades[i]}`;
}

@Pipe({ name: 'bytes' })
export class BytesPipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    return formatearBytes(bytes);
  }
}
