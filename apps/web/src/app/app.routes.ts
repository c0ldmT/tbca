import type { Routes } from '@angular/router';

/**
 * Vier Bereiche mit Tabs (Charakter, Kampf, Crew, Markt). Alte Adressen leiten weiter, damit
 * Links aus Discord und Lesezeichen gültig bleiben.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'character',
    loadComponent: () => import('./pages/character/character.page').then((m) => m.CharacterPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'gear' },
      {
        path: 'gear',
        loadComponent: () => import('./pages/character/gear/gear.page').then((m) => m.GearPage),
      },
      {
        path: 'workshop',
        loadComponent: () =>
          import('./pages/character/workshop/workshop.page').then((m) => m.WorkshopPage),
      },
      {
        path: 'loadout',
        loadComponent: () => import('./pages/character/loadout.page').then((m) => m.LoadoutPage),
      },
      {
        path: 'build',
        loadComponent: () => import('./pages/character/build.page').then((m) => m.BuildPage),
      },
    ],
  },
  {
    path: 'fight',
    loadComponent: () => import('./pages/fight/fight.page').then((m) => m.FightPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'arena' },
      {
        path: 'arena',
        loadComponent: () => import('./pages/pvp/pvp.page').then((m) => m.PvpPage),
      },
      {
        path: 'dungeon',
        loadComponent: () => import('./pages/dungeon/dungeon.page').then((m) => m.DungeonPage),
      },
      {
        path: 'training',
        loadComponent: () => import('./pages/pvp/training.page').then((m) => m.TrainingPage),
      },
      {
        path: 'history',
        loadComponent: () => import('./pages/pvp/history.page').then((m) => m.HistoryPage),
      },
    ],
  },
  {
    path: 'crew',
    loadComponent: () => import('./pages/crew/crew.page').then((m) => m.CrewPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'team' },
      {
        path: 'team',
        data: { section: 'team' },
        loadComponent: () => import('./pages/teams/teams.page').then((m) => m.TeamsPage),
      },
      {
        path: 'challenge',
        data: { section: 'challenge' },
        loadComponent: () => import('./pages/teams/teams.page').then((m) => m.TeamsPage),
      },
      {
        path: 'communities',
        data: { section: 'communities' },
        loadComponent: () => import('./pages/teams/teams.page').then((m) => m.TeamsPage),
      },
      {
        path: 'communities/:id',
        loadComponent: () =>
          import('./pages/community/community.page').then((m) => m.CommunityPage),
      },
    ],
  },
  {
    path: 'market',
    loadComponent: () => import('./pages/market/market.page').then((m) => m.MarketPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'shop' },
      {
        path: 'shop',
        loadComponent: () => import('./pages/shop/shop.page').then((m) => m.ShopPage),
      },
    ],
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'admin/items',
    loadComponent: () => import('./pages/admin/item-editor.page').then((m) => m.ItemEditorPage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
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
  // Frühere Adressen (v0.1.0)
  { path: 'pvp', redirectTo: 'fight/arena' },
  { path: 'dungeon', redirectTo: 'fight/dungeon' },
  { path: 'teams', redirectTo: 'crew/team' },
  { path: 'communities/:id', redirectTo: 'crew/communities/:id' },
  { path: 'shop', redirectTo: 'market/shop' },
  // Später: /overlay/:channel als Browser-Source für OBS (Phase 3).
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
