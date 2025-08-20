import clipboard from 'clipboardy';

// ... dentro de tu try, después de calcular inputX, inputY
await clipboard.write('hola');               // 1) sistema: portapapeles
await page.mouse.click(inputX, inputY, { clickCount: 3 });
await page.keyboard.press('Backspace');
await page.keyboard.press('Delete');
await page.keyboard.down('Control');         // 2) navegador: pegar
await page.keyboard.press('V');
await page.keyboard.up('Control');
