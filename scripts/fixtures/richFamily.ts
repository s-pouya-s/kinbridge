import type { FamilyData } from '../../src/types';

/**
 * A dedicated test fixture, deliberately separate from src/data/sampleFamily
 * (the in-app demo seed, which is the user's to edit/trim as they like).
 * Exercises: a divorce + remarriage (Dara), an unknown ancestor (Noor's
 * spouse), and two first-cousin marriages — one that lands adjacent
 * naturally (Yusuf + Sana) and one that doesn't (Layla + Omid), which is the
 * case the recenter interaction exists for.
 */
export const richFamily: FamilyData = {
  people: [
    { id: 'elias', name: 'Elias', surname: 'Amini', gender: 'male', born: '1938-03-21', died: '2015-10-05', birthPlace: 'Shiraz', gravePlace: 'Shiraz, Eram Cemetery', notes: 'Grandfather of the family; retired schoolteacher.' },
    { id: 'mara', name: 'Mara', surname: 'Amini', gender: 'female', born: '1941-07-12', died: '2020-01-18', birthPlace: 'Isfahan', gravePlace: 'Isfahan, Takht-e Foolad', notes: 'Loved gardening and poetry.' },
    { id: 'kian', name: 'Kian', surname: 'Farahani', gender: 'male', born: '1955-09-02', birthPlace: 'Tabriz', notes: "Dara's first husband; remarried after the divorce." },
    { id: 'dara', name: 'Dara', surname: 'Amini', gender: 'female', born: '1959-04-30', birthPlace: 'Shiraz' },
    { id: 'wren', name: 'Wren', surname: 'Solati', gender: 'male', born: '1962-12-11', birthPlace: 'Tehran' },
    { id: 'noor', name: 'Noor', surname: 'Amini', gender: 'female', born: '1961-02-25', birthPlace: 'Shiraz' },
    { id: 'unknown-1', name: 'Unknown', unknown: true },
    { id: 'layla', name: 'Layla', surname: 'Amini', gender: 'female', born: '1981-08-09', birthPlace: 'Shiraz' },
    { id: 'yusuf', name: 'Yusuf', surname: 'Amini', gender: 'male', born: '1985-05-17', birthPlace: 'Tehran' },
    { id: 'sana', name: 'Sana', surname: 'Amini', gender: 'female', born: '1987-11-23', birthPlace: 'Shiraz' },
    { id: 'omid', name: 'Omid', surname: 'Amini', gender: 'male', born: '1990-03-06', birthPlace: 'Shiraz' },
    { id: 'tara', name: 'Tara', surname: 'Amini', gender: 'female', born: '2012-07-29', birthPlace: 'Tehran' },
  ],
  marriages: [
    { id: 'm-elias-mara', spouseIds: ['elias', 'mara'], status: 'current', marriedYear: 1960, childIds: ['dara', 'noor'] },
    { id: 'm-kian-dara', spouseIds: ['kian', 'dara'], status: 'ended', marriedYear: 1978, endedYear: 1983, childIds: ['layla'] },
    { id: 'm-dara-wren', spouseIds: ['dara', 'wren'], status: 'current', marriedYear: 1984, childIds: ['yusuf'] },
    { id: 'm-noor-unknown', spouseIds: ['noor', 'unknown-1'], status: 'current', marriedYear: 1985, childIds: ['sana', 'omid'] },
    { id: 'm-yusuf-sana', spouseIds: ['yusuf', 'sana'], status: 'current', marriedYear: 2010, childIds: ['tara'] },
    { id: 'm-layla-omid', spouseIds: ['layla', 'omid'], status: 'current', marriedYear: 2012, childIds: [] },
  ],
};
