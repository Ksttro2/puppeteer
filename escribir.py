import pyautogui
import sys
import time

# Recibir el texto como argumento
texto = sys.argv[1] if len(sys.argv) > 1 else "hola"

pyautogui.typewrite(texto, interval=0.05)
