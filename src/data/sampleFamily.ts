import type { FamilyData } from '../types';

export const sampleFamily: FamilyData = {
  people: [
    { id: 'elias', name: 'Elias', surname: 'Amini', gender: 'male', born: '1938-03-21', died: '2015-10-05', birthPlace: 'Shiraz', gravePlace: 'Shiraz, Eram Cemetery', notes: 'Grandfather of the family; retired schoolteacher.' },
    { id: 'mara', name: 'Mara', surname: 'Amini', gender: 'female', born: '1941-07-12', died: '2020-01-18', birthPlace: 'Isfahan', gravePlace: 'Isfahan, Takht-e Foolad', notes: 'Loved gardening and poetry.' },

  ],
  marriages: [
    { id: 'm-elias-mara', spouseIds: ['elias', 'mara'], status: 'current', marriedYear: 1960, childIds: ['dara', 'noor'] },
  ],
};
