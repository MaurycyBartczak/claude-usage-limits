# usage-limits

Mod do Claude Code: pasek nad promptem pokazujący zużycie limitu sesji 5h i tygodniowego, z wykresem spalania tokenów.

```
Sesja 5h ━━━━━━━━━━━╸──────────────   43% reset za 2h 13m   Tydzień ━━━━━─────────────────────   18% reset za 3d 4h
Spalanie ▁▂▅▃█▂▁▄▆⠹  ostatnia 8.1k tok · śr. 5.3k · w tym tempie 100% za ~1h 40m
```

- Paski z kolorami progów: zielony do 50%, żółty do 75%, pomarańczowy do 90%, czerwony powyżej.
- Animacje: płynne wypełnianie, przebiegający połysk, pulsowanie powyżej 90%.
- Wykres tokenów zużytych w każdej turze (z subagentami), animowany w trakcie pracy modelu.
- Prognoza, kiedy przy obecnym tempie limit 5h dojdzie do 100%.

Dane o limitach przychodzą z odpowiedzi API, więc pojawiają się po pierwszej odpowiedzi w sesji (tylko na subskrypcji Pro/Max).

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

Repozytorium jest prywatne: instalacja działa tylko dla osób z dostępem do niego na GitHubie, których komputer ma już zapisane dane logowania git do github.com (klucz SSH albo `gh auth login`, a potem `gh auth setup-git`). Instalator nie pyta o hasło.
