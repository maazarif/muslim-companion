# Where the content comes from

No religious text in this app is typed or edited by hand. Every file in `data/` is produced by
`tools/build-content.mjs` from the sources below, which only copies the text and normalises line endings.
`tests/content.test.mjs` fails if any data file differs from the checksums at the bottom of this page,
so a change can only come from re-running the build on the recorded sources.

| Content | Source | Licence | Version |
|---|---|---|---|
| Morning and evening athkar: Arabic, English translation, transliteration, repetition count, virtue, reference | [Seen-Arabic/Morning-And-Evening-Adhkar-DB](https://github.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB) `en.json`. Its translation and transliteration are from hisnmuslim.com and sunnah.com; the athkar are from Hisn al-Muslim by Sa'id bin Ali bin Wahf al-Qahtani | MIT | commit 29d7623 |
| Duas (all 133 chapters of Hisn al-Muslim), after-prayer, before-sleep and on-waking athkar: Arabic, English translation, reference; the 99 Names of Allah | [my-prayers/muslim-data-ios](https://github.com/my-prayers/muslim-data-ios) `Sources/MuslimData/Resources/muslim_db_v2.5.1.db` (English rows) | Apache 2.0 | commit a25e61b |
| Forty Hadith of an-Nawawi, Forty Hadith Qudsi (Arabic and English), and the chapter lists of Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah and the Muwatta | [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api) `editions/{ara,eng}-{nawawi,qudsi}.json` and `info.json` | Public domain (Unlicense) | commit df57907 |
| Hadith chapters of the seven collections (Arabic, English, gradings) | Same repository, loaded in the app from `cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/…/sections/N.min.json` (raw.githubusercontent.com as a fallback). Pinned to the commit, so the text never changes underneath the app | Public domain | commit df57907 |

The English translations inside these databases come from published translations of Hisn al-Muslim and the
hadith collections. Check their terms before distributing the app commercially.

## Source file checksums (sha256)

Checked by the build script before it runs.

```
eec053c4138bed6f3ec7dc3c0e06e926a935dca24663788e5b97a0bfb5f71896  Morning-And-Evening-Adhkar-DB/en.json
527913aaf9813d922f30f33a19cc59cea59d638206e57b2d8e28fb13d519deaa  muslim-data-ios/Sources/MuslimData/Resources/muslim_db_v2.5.1.db
cf1ced267ada8f606f95eb84e2b6ddfa87bfa2a6a9dd4cb2a5d9a8c1734f10fb  hadith-api/info.json
3c8124e3f633a576d1fb6e6a9cb352e162436781b15bc78188c28203ff08743d  hadith-api/editions/eng-nawawi.json
91f559b90422005b768bb449426d87d2e6fabbb43ac3a31e5c24c50ca77465e6  hadith-api/editions/ara-nawawi.json
4d9a35148af7b04ec41f6cc3dbaf0bdb82d2f2c93d03052ee229e86dd0f6c53c  hadith-api/editions/eng-qudsi.json
8645482e46b9ab145b3a8b740ffc7dc6902cc1cc0a1845da35b2057ec23bb55a  hadith-api/editions/ara-qudsi.json
```

## Data file checksums (sha256)

Checked by `tests/content.test.mjs`.

```
95e7f234fdabd336d8b95202cb8eb58b2efcaf775515a58ff942f2f8195ec6d3  athkar.json
1b4cc3c793923a756502b6cb366d434fbed543785bbaed517709be4f563ebb1a  duas.json
adb102818074aaa0ffe32374fdfde6f6da13f816ae932be4d00c42f05af0365a  hadith-books.json
af0a89369de8cb8c7b5313c31c7133c4e0350a20554f55c98f70bb9d7be70889  hadith-forty.json
```

## To rebuild

```
git clone https://github.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB && git -C Morning-And-Evening-Adhkar-DB checkout 29d7623
git clone https://github.com/my-prayers/muslim-data-ios && git -C muslim-data-ios checkout a25e61b
git clone --filter=blob:none --sparse https://github.com/fawazahmed0/hadith-api && cd hadith-api && git checkout df57907 \
  && git sparse-checkout set --no-cone /info.json '/editions/*-nawawi.json' '/editions/*-qudsi.json' && cd ..
node tools/build-content.mjs Morning-And-Evening-Adhkar-DB muslim-data-ios hadith-api
```
