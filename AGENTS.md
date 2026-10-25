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
- Convert persisted legacy `[lat, lng]` route arrays to GeoJSON `[longitude, latitude]` at the adapter boundary and combine SQL travel dates/times into explicit instants before matching; the engine must never guess coordinate order or time zones.
- Keep Leaflet dynamically imported behind ClientOnly and routing/geocoding requests in server functions, so SSR remains safe and external requests expose no credentials.
- Use Africa/Casablanca for trip date/time conversion, including seasonal offset changes; never assume a fixed UTC offset.
- Public community routing is a prototype dependency: pace calls, verify exact persisted driving geometry, reject unverified pedestrian paths, and report unavailable routes instead of fabricating matches.
