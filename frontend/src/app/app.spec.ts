import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { etiquetaAccion, formatearBytes } from './nucleo/formato';

describe('App', () => {
  it('se crea', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});

describe('formatearBytes', () => {
  it('muestra unidades legibles', () => {
    expect(formatearBytes(512)).toBe('512 B');
    expect(formatearBytes(1536)).toBe('1.5 KB');
    expect(formatearBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatearBytes(null)).toBe('—');
  });
});

describe('etiquetaAccion', () => {
  it('convierte la accion del historial en texto legible', () => {
    expect(etiquetaAccion('ELIMINAR_DEFINITIVO')).toBe('Eliminar definitivo');
    expect(etiquetaAccion('LOGIN')).toBe('Login');
  });
});
