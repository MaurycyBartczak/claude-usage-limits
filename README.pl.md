# usage-limits

[English](README.md) · **Polski**

Mod do Claude Code: pasek nad promptem pokazujący zużycie limitu sesji 5h i tygodniowego, z wykresem spalania tokenów.

```
Sesja 5h ━━━━━━━━━━━╸──────────────   43% reset za 2h 13m    Tydzień ━━━━━─────────────────────   18% reset za 3d 4h
Spalanie ▁▂▅▃█▂▁▄▆⠹  ostatnia 8.1k tok · śr. 5.3k · w tym tempie 100% za ~1h 40m · koszt $1.23
```

- Paski z kolorami progów: zielony do 50%, żółty do 75%, pomarańczowy do 90%, czerwony powyżej.
- Animacje: płynne wypełnianie, przebiegający połysk, pulsowanie powyżej 90%.
- Wykres tokenów zużytych w każdej turze (z subagentami), animowany w trakcie pracy modelu.
- Prognoza, kiedy przy obecnym tempie limit 5h dojdzie do 100%.
- Odświeżanie na bieżąco: odczyt po każdym zapytaniu tury, współdzielony między sesjami; w trakcie pracy Claude'a przyciemniony odcinek `╍` i `~72%` pokazują szacowane zużycie do następnego odczytu (wyuczone z Twoich odczytów, więc to tylko szacunek).
- Koszt sesji w $ (równowartość cen API).
- Powiadomienia przy przekroczeniu 50%, 75% i 90% oraz po resecie limitu.
- Dźwięk przy 90% (Windows: PowerShell, macOS: afplay).
- Narzędzie `usage_limits` dla agenta: Claude może sam sprawdzić Twoje limity, gdy o nie zapytasz albo przed dużą robotą.

## Historia między sesjami i /limity

Mod zapisuje zużycie we własnym magazynie, sumując wszystkie sesje:

- Wykres spalania i prognoza limitu 5h ciągną się dalej w nowej sesji zamiast startować od zera, a pasek pokazuje dzisiejsze tokeny.
- `/limity` otwiera (a drugie `/limity` chowa) panel z ostatnimi 14 dniami:

```
Ostatnie 14 dni
nd  18.10 ━━━━━━━━━━━━━━━━━━━━──────────  120k 5h  80% 7d  30% $3.50
pon 19.10 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  412k 5h  87% 7d  34% $7.11
7 dni: 532k tok · śr. 266k/dzień aktywny · $10.61
```

Każdy dzień pokazuje zużyte tokeny, najwyższy odczyt limitu 5h i tygodniowego oraz koszt. Dni liczą się według lokalnego czasu komputera. Wyłączysz to opcją **Historia między sesjami** w `/config`.

## Panel zadań /zadania

`/zadania` otwiera (a drugie `/zadania` chowa) panel z zadaniami z planu:

```
Tryb kompaktowy — plan wdrożenia
━━━━━━━──────────────────── 1/4 zadań
kroki: 4/13
✔ Task 1: Opcja w konfiguracji        3/3
▶ Task 2: Układ jednowierszowy        1/4
○ Task 3: Tłumaczenia                 0/2
```

- Śledzi zadania, które Claude tworzy w trakcie pracy (`TodoWrite`, `TaskCreate`, `TaskUpdate`).
- Sam wczytuje plik planu, gdy Claude go zapisze, edytuje albo otworzy: plik `.md` z co najmniej dwoma nagłówkami z krokami `- [ ]` / `- [x]`. Zadanie jest zrobione, gdy wszystkie jego kroki są zaznaczone.
- Pokazuje plan zatwierdzony w plan mode.
- `/zadania ścieżka/do/planu.md` wczytuje plan ręcznie, `/zadania wyczyść` go zapomina. Panel śledzi plik, gdy kroki są odhaczane.
- W pełnoekranowym układzie terminala (od 110 kolumn) panel staje obok rozmowy, w zwykłym nad promptem.

Dane o limitach przychodzą z odpowiedzi API, więc pojawiają się po pierwszej odpowiedzi w sesji (tylko na subskrypcji Pro/Max).

## Ustawienia

W `/config`:

- **Język / Language**: `pl` (domyślnie) albo `en`.
- Każdą funkcję można włączyć lub wyłączyć (domyślnie wszystko włączone): paski 5h i tygodniowy, wykres spalania, prognoza, koszt, szacunek na żywo, historia, animacje, powiadomienia przy progach, dźwięk przy 90%, powiadomienie o resecie.

## Instalacja

W sesji Claude Code w terminalu:

```
/plugin install usage-limits --marketplace MaurycyBartczak/claude-usage-limits
```

Odpowiedz `y`, żeby dodać marketplace, potem wybierz zakres (Enter = user).

Z powłoki:

```
claude plugin install usage-limits --marketplace MaurycyBartczak/claude-usage-limits
```

W aplikacji desktopowej (gdzie `/plugin` nie działa): kliknij + obok pola promptu, potem Plugins, Add marketplace z `MaurycyBartczak/claude-usage-limits`, potem Add plugin.
