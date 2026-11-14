# Сайтни серверга жойлаштириш

Бу йўриқнома `sevinchim.uz` ни ҳар қандай **Ubuntu 22.04 / 24.04** серверга жойлаштиришни тушунтиради (Oracle Cloud, Google Cloud, Hetzner, маҳаллий VPS). DNS ва HTTPS **Cloudflare** орқали ишлайди.

Жами учта иш бор:

1. **Сервер олиш** ва унга SSH орқали уланиш.
2. Серверда **битта буйруқни** ишга тушириш: қолган ҳамма ишни скрипт ўзи қилади.
3. **Cloudflare**'да иккита DNS ёзуви қўшиш.

---

## 1. Сервер олиш

### A) Oracle Cloud — бепул

1. https://signup.cloud.oracle.com да рўйхатдан ўтинг.
   - **Home Region:** `Germany Central (Frankfurt)`. Кейин ўзгартириб бўлмайди.
   - Карта: **Visa ёки Mastercard** (Humo ва Uzcard ўтмайди).
2. **Compute → Instances → Create instance:**

   | Майдон | Қиймат |
   |---|---|
   | Image | Canonical **Ubuntu 24.04** |
   | Shape | **Ampere VM.Standard.A1.Flex** — 2 OCPU, 12 GB |
   | Networking | **Assign a public IPv4 address** — ёқилган |
   | SSH keys | **Save private key**: калитни юклаб олинг ва асраб қўйинг |
   | Boot volume | 100 GB |

3. **Subnet → Default Security List → Add Ingress Rules:**
   - Source `0.0.0.0/0`, TCP, порт **80**;
   - Source `0.0.0.0/0`, TCP, порт **443**.

> **Рўйхатдан ўта олмасангиз.** Oracle баъзи аккаунтларни сабабини айтмасдан рад этади. Энг кўп учрайдиган сабаблар ва ечимлари:
> - **VPN ёқилган.** VPN'ни ўчиринг.
> - **Маълумотлар картадаги билан мос эмас.** Исм ва манзилни картада ёзилганидек киритинг.
> - **Карта 3D Secure'ни қўлламайди.** 3D Secure'ли карта ишлатинг.
> - **Браузер ёки қурилма муаммоси.** Бошқа браузер ёки қурилмадан уриниб кўринг.
>
> Барибир ўтмаса, Б) вариантни танланг.

### Б) Бошқа VPS

Ҳар қандай VPS бўлаверади. Талаблар: **Ubuntu 24.04**, камида **1 ГБ RAM** (2 ГБ тавсия этилади) ва **20 ГБ+ диск**.
- **Маҳаллий (TAS-IX) хостинг:** Ўзбекистондаги тингловчиларга энг тез очилади ва Uzcard/Humo билан тўлаш мумкин.
- **Google Cloud e2-micro:** бепул, лекин заиф (1 ГБ RAM). Скрипт бундай серверга swap'ни ўзи қўшади.

## 2. Серверга уланиш

Компьютерингизда (Windows: PowerShell; Mac/Linux: Terminal):

```bash
ssh -i ~/Downloads/ssh-key.key ubuntu@СЕРВЕР_IP
```

> Mac/Linux'да калит файлига олдин рухсатни чекланг: `chmod 600 ~/Downloads/ssh-key.key`
> Бошқа VPS'ларда фойдаланувчи номи `root` бўлиши мумкин: `ssh root@СЕРВЕР_IP`

## 3. Битта буйруқ

Серверда шу буйруқни ишга туширинг:

```bash
curl -fsSL https://raw.githubusercontent.com/minimalluz/sevinchim.uz/main/deploy/setup.sh | bash
```

Скрипт **админ-панел паролини** сўрайди. Парол камида 10 белги бўлсин, бўш жой ва қўштирноқ, апостроф, `\`, `$` белгиларисиз. Кейин скрипт ўзи 8 та қадамни бажаради:

1. Тизим пакетлари: nginx, git, curl. RAM кам бўлса, swap ҳам қўшилади.
2. Node.js 22.
3. Файрвол: 80 ва 443 портлар (Oracle'нинг ички iptables қоидаси ҳам).
4. Сайт кодини GitHub'дан юклаб олиш → `/var/www/sevinchim-uz`.
5. `.env`: пароль, тасодифий сессия калити, маълумотлар папкаси (`/var/lib/sevinchim`).
6. Сайтни йиғиш.
7. systemd хизмати: сервер қайта юкланганда сайт ўзи ишга тушади.
8. Nginx, HTTPS ва Cloudflare'нинг ҳақиқий IP созламаси.

Охирида скрипт **сервер IP манзилини** ва Cloudflare'да нима қилиш кераклигини кўрсатади.

## 4. Cloudflare

1. https://dash.cloudflare.com → **Add a domain** → `sevinchim.uz` → **Free** тариф.
2. Cloudflare иккита **NS сервер** беради. `.uz` домен регистраторингиз панелида эски NS'ларни шу иккитасига алмаштиринг. Янгиланиши бир неча соатдан 24 соатгача олади.
3. **DNS → Records:**

   | Тури | Номи | Қиймати | Proxy |
   |---|---|---|---|
   | A | `@` | `СЕРВЕР_IP` | 🟠 Proxied |
   | A | `www` | `СЕРВЕР_IP` | 🟠 Proxied |

4. **SSL/TLS → Overview:** режим **Full**.
5. **SSL/TLS → Edge Certificates:** **Always Use HTTPS** — ёқинг. **Minimum TLS** — 1.2.

Тайёр: https://sevinchim.uz. Админ-панел: https://sevinchim.uz/admin.

### Ихтиёрий: «Full (strict)» режими

Бу режим хавфсизроқ. Уни ёқиш учун серверга Cloudflare'нинг бепул сертификатини қўясиз:

1. Cloudflare: **SSL/TLS → Origin Server → Create Certificate** → **Create**. Экранда иккита матн чиқади.
2. Серверда биринчи матнни (сертификат) сақланг:

   ```bash
   sudo mkdir -p /etc/ssl/cloudflare && sudo nano /etc/ssl/cloudflare/sevinchim.uz.pem
   ```

3. Иккинчи матнни (калит) сақланг:

   ```bash
   sudo nano /etc/ssl/cloudflare/sevinchim.uz.key
   ```

4. Скриптни қайта ишга туширинг. У сертификатни ўзи топиб ишлатади:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/minimalluz/sevinchim.uz/main/deploy/setup.sh | bash
   ```

5. Cloudflare'да режимни **Full (strict)** га ўзгартиринг.

---

## Сайтни янгилаш — автоматик

`setup.sh` ўрнатилгач, сервер **ҳар 5 дақиқада GitHub'ни ўзи текширади**. `main` га янги код тушса:

1. Янги версия **алоҳида папкада** йиғилади, ишлаб турган сайтга тегилмайди.
2. Йиғиш хато берса, сайт ўзгармайди. Telegram'га «❌ Сайтни янгилаб бўлмади» хабари келади, ўша коммит қайта уринилмайди.
3. **Эфир ёзилаётган бўлса, ёзув тугашини кутади.**
4. Папкалар алмаштирилади, сайт қайта ишга тушади ва текширилади. Очилмаса, олдинги версия дарҳол қайтарилади.
5. Telegram'га «🔄 Сайт янгиланди» хабари келади.

Фойдали буйруқлар:

```bash
sudo journalctl -u sevinchim-update -n 50      # янгилаш журнали
sudo systemctl start sevinchim-update          # ҳозироқ текшириш
systemctl list-timers sevinchim-update         # кейинги текшириш вақти
```

Олдинги версия `/var/www/sevinchim-uz.prev` папкасида сақланади. Автоматик янгилашни ўчириш учун:

```bash
curl -fsSL https://raw.githubusercontent.com/minimalluz/sevinchim.uz/main/deploy/setup.sh | AUTO_UPDATE=0 bash
```

## Захира нусха

Барча ўзгарувчан маълумотлар битта папкада: `/var/lib/sevinchim`. Ичида `content.json` ва `audio/` бор.

```bash
sudo tar czf ~/sevinchim-backup-$(date +%F).tar.gz -C /var/lib sevinchim
```

## Муаммо чиқса

| Белги | Сабаб ва ечим |
|---|---|
| Сайт очилмайди, «522» хатоси | Сервер портлари ёпиқ. Провайдер панелида 80 ва 443 портларни очинг (Oracle: Security List). |
| «526» хатоси | Cloudflare'да **Full (strict)** ёқилган, лекин Origin сертификати қўйилмаган. Режимни **Full** қилинг. |
| Админ пароли эсдан чиқди | `nano /var/www/sevinchim-uz/.env` → `ADMIN_PASSWORD` ни ўзгартиринг → `sudo systemctl restart sevinchim` |
| Сайт журнали | `sudo journalctl -u sevinchim -n 100` |
| Хизмат ҳолати | `sudo systemctl status sevinchim nginx` |

## Нима учун аудио бўлаклаб юкланади

Cloudflare'нинг бепул тарифи 100 МБ дан катта сўровни ўтказмайди. Шунинг учун админ-панел файлни **50 МБ лик бўлакларга** бўлиб юклайди: 1 ГБ гача, яъни бир неча соатлик эфир. Тармоқ узилса, юклаш ўша бўлакдан давом этади.
