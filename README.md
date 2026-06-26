# PWA Lab

Учебное PWA-приложение для демонстрации Manual QA сценариев: Service Worker, Cache Storage, IndexedDB, offline mode, update flow, install manifest и Notifications API.

## Запуск локально

Перейдите в папку приложения:

```bash
cd /path/to/pwa-qa-lab
```

Запустите локальный сервер:

```bash
node server.js
```

Откройте в браузере:

```text
http://127.0.0.1:4173/
```

Важно: не открывайте `index.html` напрямую как файл. Service Worker работает только в secure context: HTTPS, `localhost` или `127.0.0.1`.

## Запуск на Android Emulator

Проверьте, что эмулятор виден через ADB:

```bash
adb devices
```

Ожидаемый пример:

```text
emulator-5554    device
```

Пробросьте порт локального сервера в эмулятор:

```bash
adb reverse tcp:4173 tcp:4173
```

Проверьте проброс:

```bash
adb reverse --list
```

Ожидаемый пример:

```text
tcp:4173 tcp:4173
```

Откройте приложение в браузере эмулятора:

```text
http://127.0.0.1:4173/
```

Можно открыть URL из терминала:

```bash
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:4173/
```

Почему `adb reverse`, а не `10.0.2.2`: с reverse-пробросом в эмуляторе можно открыть именно `127.0.0.1`, а это secure context. Так Service Worker и PWA-функции работают корректнее.

## Альтернативный адрес без reverse

Android Emulator обычно видит хост-машину по адресу:

```text
http://10.0.2.2:4173/
```

Но для PWA это хуже, потому что `10.0.2.2` может не считаться secure context. Страница откроется, но Service Worker может не зарегистрироваться.

## Интернет на Android Emulator

Обычно интернет в Android Emulator работает автоматически через NAT хост-машины. Отдельно “пробрасывать интернет” как порт не нужно.

Если интернет в эмуляторе не работает:

1. Проверьте, что интернет есть на компьютере.
2. В эмуляторе отключите Airplane mode.
3. Перезапустите Wi-Fi/mobile data в эмуляторе.
4. Проверьте, не задан ли proxy в настройках эмулятора.
5. В Android Studio откройте Device Manager и перезапустите эмулятор.
6. Попробуйте открыть в браузере эмулятора:

```text
https://dummyjson.com/products?limit=1
```

Если сайт открывается, интернет в эмуляторе есть.

Если локальное PWA открывается, но запросы к DummyJSON не работают, проверьте DevTools Network и статус сети в самом приложении.

### Если локальный сайт открывается, но интернета в эмуляторе нет

Иногда эмулятор видит локальный сервер через `10.0.2.2` или `adb reverse`, но не может открыть внешние сайты. Частая причина — проблема с DNS внутри AVD.

Признаки:

```text
http://127.0.0.1:4173/ открывается
https://dummyjson.com/products?limit=1 не открывается
в статус-баре Android написано No internet connection
```

Проверка:

```bash
adb shell ping -c 1 8.8.8.8
adb shell ping -c 1 dummyjson.com
```

Если IP отвечает, а домен не резолвится, перезапустите эмулятор с явными DNS-серверами.

Узнать имя текущего AVD:

```bash
adb emu avd name
```

Закрыть текущий эмулятор:

```bash
adb emu kill
```

Запустить AVD с DNS:

```bash
~/Library/Android/sdk/emulator/emulator \
  -avd {avd_name} \
  -dns-server 8.8.8.8,1.1.1.1
```

После перезапуска снова настройте проброс:

```bash
adb reverse tcp:4173 tcp:4173
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:4173/
```

Если `No internet connection` остается в статус-баре несколько секунд, обновите страницу или подождите: Android network validation может обновиться не сразу.

## Полезные команды ADB

Список устройств:

```bash
adb devices
```

Проброс порта:

```bash
adb reverse tcp:4173 tcp:4173
```

Список reverse-пробросов:

```bash
adb reverse --list
```

Удалить конкретный проброс:

```bash
adb reverse --remove tcp:4173
```

Удалить все reverse-пробросы:

```bash
adb reverse --remove-all
```

Открыть приложение в браузере эмулятора:

```bash
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:4173/
```

## Проверка PWA

В Chrome DevTools смотрите:

- `Application -> Manifest`
- `Application -> Service workers`
- `Application -> Cache storage`
- `Application -> IndexedDB`
- `Application -> Storage`
- `Network -> Offline`
- `Network -> Disable cache`

Для проверки обновления Service Worker:

1. Откройте приложение.
2. Измените версию в `sw.js` и `app.js`.
3. В приложении откройте вкладку `dev`.
4. Нажмите `Check update`.
5. Должен появиться баннер `Доступна новая версия`.
6. Нажмите `Обновить`.

## Demo credentials

Для входа используется DummyJSON Auth:

```text
username: emilys
password: emilyspass
```
