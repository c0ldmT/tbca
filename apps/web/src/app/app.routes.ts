import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'character',
    loadComponent: () => import('./pages/character/character.page').then((m) => m.CharacterPage),
  },
  {
    path: 'pvp',
    loadComponent: () => import('./pages/pvp/pvp.page').then((m) => m.PvpPage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
  },
  {
    path: 'teams',
    loadComponent: () => import('./pages/teams/teams.page').then((m) => m.TeamsPage),
  },
  {
    path: 'dungeon',
    loadComponent: () => import('./pages/dungeon/dungeon.page').then((m) => m.DungeonPage),
  },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'replay/:id',
    loadComponent: () => import('./pages/replay/replay.page').then((m) => m.ReplayPage),
  },
  {
    path: 'impressum',
    data: { section: 'imprint' },
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
  },
  {
    path: 'datenschutz',
    data: { section: 'privacy' },
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
  },
  // Später: /overlay/:channel als Browser-Source für OBS (Phase 3).
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
