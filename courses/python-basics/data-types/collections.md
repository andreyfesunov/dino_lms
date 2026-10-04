# Списки, словари и множества

Три главные коллекции Python покрывают большинство повседневных задач.

## Список — упорядоченная коллекция

```python
skills = ["python", "sql"]
skills.append("docker")
skills[0]        # "python"
len(skills)      # 2
```

## Словарь — ключ → значение

```python
student = {"name": "Ира", "group": "B-21"}
student["name"]
student["grade"] = 5
```

## Множество — уникальные элементы

```python
tags = {"python", "sql", "python"}
len(tags)   # 2
```

## Итог

- Список — порядок и дубликаты
- Словарь — быстрый поиск по ключу
- Множество — уникальность

{{ youtube: https://youtu.be/W8KRzm-HUcc | Python Dictionaries and Lists | Corey Schafer }}
