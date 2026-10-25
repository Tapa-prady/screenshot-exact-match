<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep pricing and route matching in browser-safe pure modules shared by search and booking, so every surface applies identical rules.
- Use Turf to project pickups onto the driver's geometry and require a resolved pedestrian route before accepting a match; straight-line proximity cannot establish walking distance.
- Store cumulative distance and travel time alongside route geometry when integrating routing providers, so pickup time and passenger fare follow the actual driven segment.
