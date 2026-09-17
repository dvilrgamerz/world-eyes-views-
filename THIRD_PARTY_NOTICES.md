# Third-Party Notices

World Eyes View combines public and third-party data sources. Each provider keeps its own rights, terms, quotas, and attribution requirements.

## God's Eye View inspiration and MIT source

World Eyes View V2 was designed after reviewing the open-source **God's Eye View** project by Bilawal Sidhu. The upstream project's source code is published under the MIT License. World Eyes View uses its public feature architecture and provider ideas as a reference and may contain adapted MIT-licensed implementation concepts. The original copyright and MIT permission notice are preserved below.

> MIT License
>
> Copyright (c) 2026 Bilawal Sidhu
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Upstream repository: `bilawalsidhu/gods-eye-view`.

**Important:** the upstream repository explicitly states that its third-party datasets, runtime data, and 3D models are not automatically covered by the MIT code license. World Eyes View therefore does not copy those restricted bundled assets into this repository.

## Runtime data providers

Current V2 integrations include:

- **OpenSky Network** — civil aircraft state vectors; provider terms and rate limits apply.
- **adsb.lol** — military ADS-B feed; provider terms and rate limits apply.
- **AISStream** — optional vessel telemetry; requires the user's own API key and provider terms apply.
- **CelesTrak** — orbital element data used to propagate satellite positions.
- **USGS** — earthquake feeds.
- **NASA EONET** — natural-event data including wildfires, severe storms, volcanoes and floods.
- **The Space Devs / Launch Library 2** — rocket launch schedules and launch-site metadata.
- **OpenStreetMap / Overpass** — datacenter and dam features around the current view; ODbL attribution applies.
- **OpenStreetMap Nominatim** — place search.
- **World Bank** — latest-available annual merchandise-trade values.
- **GDELT** — recent global-news discovery.
- **Esri World Imagery**, **OpenStreetMap tiles**, and **CARTO** — selectable basemaps; their terms and attribution requirements apply.

No provider relationship, endorsement, or guarantee of uninterrupted availability is implied.
