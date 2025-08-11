import puppeteer from "puppeteer";
import fs from "fs";
import { PNG } from "pngjs";

// Función para encontrar coordenadas de una imagen dentro de la pantalla
async function findImageCoordinates(page, targetImagePath) {
  await page.screenshot({ path: "fullpage.png", fullPage: true });

  const fullImage = PNG.sync.read(fs.readFileSync("fullpage.png"));
  const target = PNG.sync.read(fs.readFileSync(targetImagePath));

  const { width: fw, height: fh } = fullImage;
  const { width: tw, height: th } = target;

  for (let y = 0; y <= fh - th; y++) {
    for (let x = 0; x <= fw - tw; x++) {
      let match = true;

      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          const fullIdx = ((y + ty) * fw + (x + tx)) * 4;
          const targetIdx = (ty * tw + tx) * 4;

          for (let i = 0; i < 4; i++) {
            if (Math.abs(fullImage.data[fullIdx + i] - target.data[targetIdx + i]) > 20) {
              match = false;
              break;
            }
          }
          if (!match) break;
        }
        if (!match) break;
      }

      if (match) {
        return { x: x + tw / 2, y: y + th / 2 };
      }
    }
  }

  return null;
}

const credenciales = [
  { usuario: "admin", password: "Gpon2016CLARO!" },
  { usuario: "admin@claro", password: "Gpon2016CLARO!" }
];

async function openWebPage() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    await page.goto("https://10.177.120.153", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Saltar advertencia de seguridad si aparece
    try {
      await page.waitForSelector("#details-button", { timeout: 5000 });
      await page.click("#details-button");
      await page.waitForSelector("#proceed-link", { timeout: 5000 });
      await page.click("#proceed-link");
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      console.log("➡️ Saltó advertencia SSL");
    } catch (err) {
      console.log("⚠️ Advertencia SSL no apareció o ya fue pasada.");
    }

    let loginExitoso = false;

    for (let i = 0; i < credenciales.length; i++) {
      const cred = credenciales[i];
      console.log(`🔐 Probando login con: ${cred.usuario}`);

      await page.waitForSelector("#Frm_Username", { timeout: 5000 });
      await page.waitForSelector("#Frm_Password", { timeout: 5000 });

      // Limpiar campos
      await page.click("#Frm_Username", { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.click("#Frm_Password", { clickCount: 3 });
      await page.keyboard.press('Backspace');

      // Ingresar usuario y contraseña
      await page.type("#Frm_Username", cred.usuario, { delay: 50 });
      await page.type("#Frm_Password", cred.password, { delay: 50 });

      // Hacer login
      await Promise.all([
        page.click("#LoginId"),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      ]);

      const url = page.url();
      if (url.includes("start.ghtml")) {
        console.log(`✅ Login exitoso con: ${cred.usuario}`);
        loginExitoso = true;
        break;
      } else {
        console.log(`❌ Falló login con: ${cred.usuario}`);

        await page.goto("https://10.177.120.153", {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        try {
          await page.waitForSelector("#details-button", { timeout: 3000 });
          await page.click("#details-button");
          await page.waitForSelector("#proceed-link", { timeout: 3000 });
          await page.click("#proceed-link");
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          console.log("🔁 Advertencia SSL reapareció y fue saltada.");
        } catch (e) {
          // No apareció, continuar
        }
      }
    }

    if (!loginExitoso) {
      console.log("❌ Ninguna credencial funcionó.");
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 🔍 Buscar botón 'Security' por imagen
    const coords = await findImageCoordinates(page, 'security_button.png');
    if (coords) {
      console.log(`📍 Coordenadas detectadas: x=${coords.x}, y=${coords.y}`);
      await page.mouse.click(coords.x, coords.y);
      console.log("🛡️ Hizo clic en 'Security'");
    } else {
      console.log("❌ No se encontró la imagen del botón 'Security'.");
      return;
    }

    // ✅ Validar y marcar checkbox si no está marcado
    let hizoClickEnSinEnvio = false;

    try {
      await page.waitForSelector("#Frm_IsProtect", { timeout: 10000 });
      const isChecked = await page.$eval("#Frm_IsProtect", el => el.checked);
      if (!isChecked) {
        await page.click("#Frm_IsProtect");
        console.log("✅ Checkbox seleccionado desde DOM");
      } else {
        console.log("☑️ Checkbox ya estaba seleccionado");
      }
    } catch (err) {
      console.log("⚠️ No se pudo acceder al checkbox directamente, intentando con imagen...");

      const coords = await findImageCoordinates(page, 'envio.png');

      if (coords) {
        console.log("☑️ El checkbox ya está activado (envio.png encontrado), no se hace clic.");
        // No se hace clic ni se avanza a enviar.png
      } else {
        console.log("🔁 No se encontró envio.png, buscando sinenvio.png...");

        const fallbackCoords = await findImageCoordinates(page, 'sinenvio.png');
        if (fallbackCoords) {
          console.log(`📍 Coordenadas detectadas: x=${fallbackCoords.x}, y=${fallbackCoords.y}`);
          await page.mouse.click(fallbackCoords.x, fallbackCoords.y);
          console.log("✅ Hizo clic en el checkbox (sinenvio.png)");
          hizoClickEnSinEnvio = true;
        } else {
          console.log("❌ No se encontró ninguna de las dos imágenes.");
        }
      }
    }

    // Solo si se hizo clic en sinenvio.png, hacer clic en enviar
    if (hizoClickEnSinEnvio) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const enviar = await findImageCoordinates(page, 'enviar.png');
      if (enviar) {
        console.log(`📍 Coordenadas detectadas: x=${enviar.x}, y=${enviar.y}`);
        await page.mouse.click(enviar.x, enviar.y);
        console.log("📤 Hizo clic en 'botón enviar'");
      } else {
        console.log("❌ No se encontró la imagen del botón 'enviar'.");
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    }


    const enviado = await findImageCoordinates(page, 'administracion.png');
    if (enviado) {
      console.log(`📍 Coordenadas detectadas: x=${enviado.x}, y=${enviado.y}`);
      await page.mouse.click(enviado.x, enviado.y);
      console.log("📤 Hizo clic en 'botón enviar'");
    } else {
      console.log("❌ No se encontró la imagen del botón 'administracion'.");
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Actualizar campo ACS URL
    const acsLabel = await findImageCoordinates(page, 'acs_url.png');
    if (acsLabel) {
      const offsetX = 100; // ajustar si el input está más lejos
      const offsetY = 10;

      const inputX = acsLabel.x + offsetX;
      const inputY = acsLabel.y + offsetY;

      console.log(`📍 Coordenadas detectadas para ACS URL: x=${acsLabel.x}, y=${acsLabel.y}`);
      console.log(`👉 Clic en input: x=${inputX}, y=${inputY}`);

      // Hacer doble clic para seleccionar el campo
      await page.mouse.click(inputX, inputY, { clickCount: 2 });
      await new Promise(resolve => setTimeout(resolve, 200));

      // Ctrl+A y Backspace para limpiar
      await page.mouse.click(inputX, inputY);
      await page.keyboard.sendCharacter('\u0001'); // Ctrl+A

     // Borrar
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Delete');


      // Escribir nueva URL
      const nuevaACS = "hola";
      await page.keyboard.type(nuevaACS, { delay: 30 });
      console.log("✍️ ACS URL actualizado correctamente");
    } else {
      console.log("❌ No se encontró la imagen del campo 'ACS URL'.");
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    // Actualizar campo Username
    const usernameLabel = await findImageCoordinates(page, 'username.png');
    if (usernameLabel) {
      const offsetX = 100;
      const offsetY = 10;

      const inputX = usernameLabel.x + offsetX;
      const inputY = usernameLabel.y + offsetY;

      console.log(`📍 Coordenadas detectadas para Username: x=${usernameLabel.x}, y=${usernameLabel.y}`);
      console.log(`👉 Clic en input: x=${inputX}, y=${inputY}`);

      await page.mouse.click(inputX, inputY, { clickCount: 2 });
      await new Promise(resolve => setTimeout(resolve, 200));

      // Ctrl+A y Backspace para limpiar
      await page.keyboard.sendCharacter('\u0001');
      await page.keyboard.down('Control');
      await page.keyboard.press('x');
      await page.keyboard.up('Control');

      const username = "Claroadmin";
      await page.keyboard.type(username, { delay: 30 });
      console.log("✍️ Username actualizado correctamente");
    } else {
      console.log("❌ No se encontró la imagen del campo 'username'.");
    }


  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    // await browser.close();
  }
}

openWebPage();
