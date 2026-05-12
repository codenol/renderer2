# CMDB-модель ПАК — Отчёт по компонентам

> Источник: `[GEN-174] Управление: Отчет по компонентам ПАК` (trebovanija.pdf), раздел «Анализ требований», стр. 10-25.

---

## 1. Иерархия объектов

```
ПАК
├── Коммутаторы
├── Серверы
│   ├── Процессор
│   ├── ОС
│   ├── Оперативная память
│   ├── Диск
│   ├── Сетевые адаптеры
│   ├── Контроллер дисков
│   ├── Дисковые полки
│   │   └── Диски (входящие)
│   └── Точки монтирования
├── Сетевые интерфейсы
├── ПО (пакетный менеджер)       [план Q2]
├── Системное ПО                  [план Q2]
├── Конфигурация ВМ               [план Q2]
├── Конфигурация drbd             [план Q2]
├── Список процессов              [план Q2]
└── Синхронизация времени         [план Q2]
```

---

## 2. Объекты и атрибуты

### ПАК (№22-23)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 22 | Имя ПАК | МБДП-001 | ORM | Да (через связь) |
| 23 | Модель | — | ИК/ORM | Да |

---

### Коммутаторы (№18-32)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 19 | Foliage id | hub/206c1bda2ae26b57369a2582d6ec9f40 | ORM | Да |
| 20 | ID | — | ORM | Да |
| 21 | Имя | SWGenom1 | ИК | Да |
| 22 | Имя ПАК | — | ORM | Да (через связь) |
| 23 | Модель | B4COM CS4132U-AC | ИК/ORM | Да |
| 24 | Роль | access switch | ИК | Нет |
| 25 | IP адреса | 192.168.104.26 | ИК/ORM | Да |
| 26 | PN | SR-CS4132U-AC-B-SW | ИК | Нет |
| 27 | Серийный номер | — | ORM | Да |
| 28 | Производитель | — | ORM | Да |
| 29 | Описание | — | ORM | Да |
| 30 | Версия прошивки | — | ORM | Да |
| 31 | Порты → Тип | ethernet-csmacd | ORM | Да |
| 32 | Порты → Колво | 60 | ORM | Да |

---

### Серверы (№39-49)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 39 | Foliage id | hub/206c1bda2ae26b57369a2582d6ec9f40 | ORM | Да (через связь) |
| 40 | Имя | scs-01node-01.adb.local | ИК | Да |
| 41 | Имя ПАК | МБДП-001 | ORM | Да |
| 42 | ID | — | ORM | Да |
| 43 | Модель | Vegman R220 | ИК/ORM | Да |
| 44 | IP | 192.168.104.51 | ИК | Да |
| 45 | PN | Y05X82U2S101A_73E80A | ИК | Да |
| 46 | Производитель | — | ORM | Да |
| 47 | Серийный номер | — | ИК/ORM | Нетвроде ДА (см hw-mainboard) |
| 48 | IP адрес BMC | — | ORM | Да |
| 49 | Версия BMC | OutofBand Management | — | Нет |

---

### Процессор (№51-57)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 51 | Модель | 2x Intel Xeon 6342 (2,8/24) | ИК/ORM | Да |
| 52 | Колво ядер | 48 | ИК/ORM | Да |
| 53 | Колво потоков | — | ORM | Да |
| 54 | Производитель | QEMU | ORM | Да |
| 55 | Серия | — | ORM | — |
| 57 | Семейство | — | ORM | — |

*Дискаверинг: `cat /proc/cpuinfo | grep 'model name'`*

---

### ОС (№58)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 58 | Имя | Debian | ИК | Нет |
| 58 | Версия | 11 | ИК | Нет |

*План: Q2*

---

### Оперативная память (№59-64)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 59 | Объём | 32 | ИК/ORM | Да |
| 60 | Номер модуля | M393A4K40EB3CWE | — | Да |
| 61 | Серийный номер | 2224-51A3AA82 | — | Да |
| 62 | Производитель | Samsung | — | Да |
| 62 | Тип | — | ИК/ORM | Да |
| 63 | Колво | — | — | Да |
| 64 | Модель | — | — | — |

*Дискаверинг: `dmidecode -t memory`*

---

### Диск (№65-72)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 65 | Объём | 960 | — | Да |
| 66 | Модель | Samsung PM893 | ИК/ORM | Да |
| 67 | Тип | SSD, HDD, NVMe | — | Да |
| 68 | Имя | sda | — | Да |
| 69 | Серийный номер | S665NN0X911938 | — | Да |
| 70 | Протокол | SATA | — | Да |
| 71 | Версии прошивок | — | — | Нет |
| 72 | Колво | — | ORM | Да |

---

### Сетевые адаптеры (№73-81)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 73 | Foliage id | — | ORM | Да |
| 74 | Имя ПАК | — | ORM | Да (через связь) |
| 75 | PCI | 0000:01:00.0 | — | Нет |
| 76 | Модель | Ethernet Controller I225LM | — | Да |
| 77 | Производитель | Intel Corporation | — | Да |
| 78 | MAC | f0:3f:03:01:42:9e | — | Да, по порту |
| 79 | Версия прошивки адаптера | 1082:8770 | — | Да |
| 80 | IP | 192.168.10.5 | — | Да, по порту |
| 81 | Скорость | 10Mbit/s full duplex, 1Gbit/s full duplex | — | Да, по порту |

---

### Сетевые интерфейсы (№36-38)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 36 | Тип | — | — | Да |
| 37 | Подсети | — | — | Да (сейчас конфиг, в будущем ИК) |
| 38 | Имя сети | — | — | Да (сейчас конфиг, в будущем ИК) |

---

### Контроллер дисков (№84-89)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 84 | Имя | — | — | Да, по порту |
| 85 | Модель | Broadcom MegaRAID 9560-8 | — | Да |
| 86 | Производитель | Broadcom | — | Да |
| 87 | Серийный номер | DCTRL-0001 | — | Да |
| 88 | Тип | RAID, HBA | — | Да |
| 89 | Версия прошивки | — | ORM | Да |

---

### Дисковые полки (№90-92)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 90 | Имя | TUSN-01 1024 030F 1009 | — | Да |
| 91 | Серийный номер | 0110 2403 0F10 09 | — | — |
| 92 | Модель | Storage System YADRO TATLIN.UNIFIED GEN2 | — | — |

---

### Диски (№93)

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 93 | Перечисление всех входящих дисков | 7.7 TB SSD SAMSUNG MZILG7T6HBLA/A07-GXG3 (s/n S70KNN0X606398) | — | — |

---

### ПО (пакетный менеджер) (№94-95) [план Q2]

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 94 | Название | nginx | — | Нет, план. в Q2 |
| 95 | Версия | 1.22 | — | Нет, план. в Q2 |

---

### Системное ПО (№96-97) [план Q2]

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 96 | Название | — | — | Нет, план. в Q2 |
| 97 | Версия | — | — | Нет, план. в Q2 |

---

### Конфигурация ВМ (№98) [план Q2]

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 98 | Конфигурация ВМ | — | — | Нет, план. в Q2 |

---

### Конфигурация drbd (№99) [план Q2]

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 99 | Конфигурация drbd | — | — | Нет, план. в Q2 |

---

### Список процессов (№100) [план Q2]

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 100 | Вывод списка процессов | `ps -ef` | — | Нет, план. в Q2 |

*Примечание: «Функционал валидный, но точно не смдб!»*

---

### Синхронизация времени (№101) [план Q2]

| # | Атрибут | Пример | Источник | В Foliage |
|---|---------|--------|----------|-----------|
| 101 | Статус синхронизации времени | `timedatectl status`, `chronyc tracking; chronyc sources` | — | Нет, план. в Q2 |

*Примечание: «Возможно в рамках смдб требуется хранить конфигурацию (перечень узлов с которыми осуществляется синхронизация)»*

---

## 3. Источники данных

| Источник | Описание |
|----------|----------|
| **ИК** | Инсталляционная карта |
| **ORM** | Object Relationship Manager |
| **Foliage** | Система мониторинга (foliage-агент) |
| **Дискаверинг** | Автоматическое обнаружение (lsblk, df, cat /proc/cpuinfo, dmidecode и т.д.) |
| **Паспорт ПАК** | Документация на ПАК |

---

## 4. План работы с моделью в ReportBuilder

### 4.1. Формат данных

**Рекомендация: плоские записи с `parent_id` + `parent_type`**

```yaml
allData:
  - id: "pak-001"
    type: "pak"
    parent_id: null
    parent_type: null
    pak_name: "s3m-03b01-msk01"
    pak_type: "МБД.П"
    pak_serial: "19384753"
    pak_location: "Кострома-1"

  - id: "srv-001"
    type: "server"
    parent_id: "pak-001"
    parent_type: "pak"
    server_name: "scs-01node-01.adb.local"
    server_model: "Vegman R220"
    server_ip: "192.168.104.51"
    server_pn: "Y05X82U2S101A_73E80A"
    server_serial: "..."
    server_bmc_ip: "..."
    server_bmc_version: "..."

  - id: "cpu-001"
    type: "processor"
    parent_id: "srv-001"
    parent_type: "server"
    cpu_model: "2x Intel Xeon 6342"
    cpu_cores: 48
    cpu_threads: "..."
    cpu_vendor: "QEMU"

  - id: "ram-001"
    type: "memory"
    parent_id: "srv-001"
    parent_type: "server"
    ram_size: 32
    ram_module: "M393A4K40EB3CWE"
    ram_serial: "2224-51A3AA82"
    ram_vendor: "Samsung"
    ram_type: "..."
    ram_count: "..."

  - id: "disk-001"
    type: "disk"
    parent_id: "srv-001"
    parent_type: "server"
    disk_size: 960
    disk_model: "Samsung PM893"
    disk_type: "SSD"
    disk_name: "sda"
    disk_serial: "S665NN0X911938"
    disk_protocol: "SATA"
    disk_count: "..."

  - id: "nic-001"
    type: "network_adapter"
    parent_id: "srv-001"
    parent_type: "server"
    nic_pci: "0000:01:00.0"
    nic_model: "Ethernet Controller I225LM"
    nic_vendor: "Intel Corporation"
    nic_mac: "f0:3f:03:01:42:9e"
    nic_firmware: "1082:8770"
    nic_ip: "192.168.10.5"
    nic_speed: "1Gbit/s full duplex"

  - id: "dctrl-001"
    type: "disk_controller"
    parent_id: "srv-001"
    parent_type: "server"
    dctrl_model: "Broadcom MegaRAID 9560-8"
    dctrl_vendor: "Broadcom"
    dctrl_serial: "DCTRL-0001"
    dctrl_type: "RAID"
    dctrl_firmware: "..."

  - id: "shelf-001"
    type: "disk_shelf"
    parent_id: "srv-001"
    parent_type: "server"
    shelf_name: "TUSN-01"
    shelf_serial: "011024030F1009"
    shelf_model: "YADRO TATLIN.UNIFIED GEN2"

  - id: "sw-001"
    type: "switch"
    parent_id: "pak-001"
    parent_type: "pak"
    switch_name: "SWGenom1"
    switch_model: "B4COM CS4132U-AC"
    switch_role: "access switch"
    switch_ip: "192.168.104.26"
    switch_pn: "SR-CS4132U-AC-B-SW"
    switch_serial: "..."
    switch_vendor: "..."
    switch_firmware: "..."
    switch_ports_type: "ethernet-csmacd"
    switch_ports_count: 60
```

**Почему плоский формат:**
- Совместим с текущей архитектурой ReportBuilder (`allData: Record<string, string>[]`)
- Легко фильтровать по любому типу объекта
- Легко делать JOIN через `parent_id`
- Не требует рекурсивного парсинга вложенных структур

### 4.2. Расширение интерфейса ReportBuilder

#### 4.2.1. Выбор типа объекта для отображения

Добавить переключатель/фильтр по `type`:
```
[Все] [ПАК] [Серверы] [Коммутаторы] [Процессоры] [RAM] [Диски] [Сетевые адаптеры] [Контроллеры] [Полки]
```

#### 4.2.2. Колонки из родительских объектов

Добавить поддержку «вычисляемых» колонок, которые берут данные из родителя:
```
server.parent.pak_name  → "Название ПАК (родитель)"
server.parent.pak_type  → "Тип ПАК (родитель)"
disk.parent.server_name → "Сервер (родитель)"
```

#### 4.2.3. Группировка по иерархии

Существующий механизм `groupBy` уже поддерживает группировку по любому полю. Для иерархического отображения:
1. Группировка по `pak_name` (уровень 1)
2. Внутри — группировка по `server_name` (уровень 2)
3. Внутри — сами объекты (уровень 3)

Это достигается последовательной сортировкой: сначала по `pak_name`, затем по `server_name`.

#### 4.2.4. Шаблоны отчётов

Сохранённые шаблоны (уже реализовано) могут хранить предустановленные конфигурации:

| Шаблон | groupBy | visibleColumns | filters |
|--------|---------|----------------|---------|
| Табл. 3 (Оборудование) | `pak_name` → `server_name` | pak_name, server_name, disk_model, disk_count, disk_serial | type = disk |
| Табл. 5 (ПО) | `pak_name` → `server_name` | pak_name, server_name, sw_name, sw_version, sw_vendor | type = software |
| Табл. 6 (Узлы) | `pak_name` → `server_name` | pak_name, server_name, server_model, server_ip, server_pn | type = server |

### 4.3. Этапы реализации

#### Этап 1: Подготовка данных (YAML)
- [ ] Перевести текущие данные из плоского `entity_type` в новый формат с `type`, `id`, `parent_id`
- [ ] Добавить объекты: коммутаторы, процессоры, RAM, диски, сетевые адаптеры, контроллеры, полки
- [ ] Установить связи `parent_id` между объектами

#### Этап 2: Расширение ReportBuilder
- [ ] Добавить фильтр по `type` (мультивыбор чипами)
- [ ] Добавить поддержку «родительских» колонок (`parent.pak_name` и т.д.)
- [ ] Добавить поддержку многоуровневой группировки (последовательная сортировка)

#### Этап 3: Шаблоны отчётов
- [ ] Создать шаблоны для Табл. 3, 5, 6
- [ ] Добавить кнопку «Применить шаблон» в интерфейс

#### Этап 4 (будущее): API-интеграция
- [ ] Адаптер данных из Foliage/CMDB API вместо YAML
- [ ] Реалтайм-обновление данных

### 4.4. Типы объектов (type)

| type | label | parent_type |
|------|-------|-------------|
| `pak` | ПАК | — |
| `switch` | Коммутатор | `pak` |
| `server` | Сервер | `pak` |
| `processor` | Процессор | `server` |
| `os` | ОС | `server` |
| `memory` | Оперативная память | `server` |
| `disk` | Диск | `server` |
| `network_adapter` | Сетевой адаптер | `server` |
| `disk_controller` | Контроллер дисков | `server` |
| `disk_shelf` | Дисковая полка | `server` |
| `network_interface` | Сетевой интерфейс | `server` |
| `software` | ПО | `server` [Q2] |
| `vm_config` | Конфигурация ВМ | `server` [Q2] |
| `drbd_config` | Конфигурация drbd | `server` [Q2] |
| `process_list` | Список процессов | `server` [Q2] |
| `time_sync` | Синхронизация времени | `server` [Q2] |

### 4.5. Все атрибуты (flat namespace)

Для избежания коллизий имён, все атрибуты префиксуются типом объекта:

```
# ПАК
pak_name, pak_type, pak_serial, pak_location, pak_model

# Коммутатор
switch_foliage_id, switch_id, switch_name, switch_pak_name, switch_model,
switch_role, switch_ip, switch_pn, switch_serial, switch_vendor,
switch_description, switch_firmware, switch_ports_type, switch_ports_count

# Сервер
server_foliage_id, server_name, server_pak_name, server_id, server_model,
server_ip, server_pn, server_vendor, server_serial, server_bmc_ip,
server_bmc_version, server_mount_points

# Процессор
cpu_model, cpu_cores, cpu_threads, cpu_vendor, cpu_series, cpu_family

# ОС
os_name, os_version

# RAM
ram_size, ram_module, ram_serial, ram_vendor, ram_type, ram_count, ram_model

# Диск
disk_size, disk_model, disk_type, disk_name, disk_serial, disk_protocol,
disk_firmware, disk_count

# Сетевой адаптер
nic_foliage_id, nic_pak_name, nic_pci, nic_model, nic_vendor, nic_mac,
nic_firmware, nic_ip, nic_speed

# Сетевой интерфейс
netif_type, netif_count, netif_role, netif_subnet, netif_subnet_name

# Контроллер дисков
dctrl_name, dctrl_model, dctrl_vendor, dctrl_serial, dctrl_type,
dctrl_firmware

# Дисковая полка
shelf_name, shelf_serial, shelf_model

# Диски (входящие в полку)
shelf_disks  # строка с перечислением

# ПО
sw_name, sw_version

# Системное ПО
sys_sw_name, sys_sw_version

# Конфигурация ВМ
vm_config

# drbd
drbd_config

# Процессы
process_list

# Синхронизация времени
time_sync_status
```
