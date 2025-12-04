# Ícones do PWA

Esta pasta deve conter os ícones do Progressive Web App (PWA) nos seguintes tamanhos:

- `icon-72x72.png` (72x72 pixels)
- `icon-96x96.png` (96x96 pixels)
- `icon-128x128.png` (128x128 pixels)
- `icon-144x144.png` (144x144 pixels)
- `icon-152x152.png` (152x152 pixels) - iOS
- `icon-192x192.png` (192x192 pixels) - Android
- `icon-384x384.png` (384x384 pixels)
- `icon-512x512.png` (512x512 pixels) - Splash screen

## Requisitos

- Formato: PNG
- Fundo transparente ou sólido
- Ícones devem ser otimizados para diferentes tamanhos
- Para melhor compatibilidade, use ícones "maskable" (com padding de segurança)

## Como criar os ícones

1. Crie um ícone base de 512x512 pixels
2. Gere os tamanhos menores usando ferramentas como:
   - [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
   - [RealFaviconGenerator](https://realfavicongenerator.net/)
   - [PWA Builder](https://www.pwabuilder.com/imageGenerator)

## Nota

Os ícones são referenciados no `manifest.json` e são necessários para que o PWA funcione corretamente em dispositivos móveis.

