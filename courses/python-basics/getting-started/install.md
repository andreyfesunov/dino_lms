# Установка и первый запуск

Python доступен на всех основных платформах. Разберём установку и запуск первой программы.

## Скачивание

Официальный установщик — с сайта [python.org](https://www.python.org/downloads/). Для Windows достаточно установщика с галочкой **Add Python to PATH**.

{{ youtube: https://www.youtube.com/watch?v=YYXdXT2lGNg | Python for Beginners — Install and Setup | Programming with Mosh }}

## Проверка установки

Откройте терминал и выполните:

```bash
python --version
```

Должна появиться версия, например `Python 3.12.4`.

## Интерактивный режим

Запуск `python` без аргументов открывает REPL — интерактивную оболочку:

```python
>>> 2 + 2
4
>>> "динозавр".upper()
'ДИНОЗАВР'
```

## Запуск файла

Создайте `hello.py`:

```python
name = input("Как вас зовут? ")
print(f"Привет, {name}!")
```

И выполните `python hello.py`. В следующей главе — типы данных.

{{ video: explain.mp4 }}