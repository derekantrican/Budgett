import React, { useEffect, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import {
  getCategories, getAccounts, getItems, getPlanningViews, getIncome, getExtensions, getSettings,
  getDashboardTiles, createDashboardTile, updateDashboardTile, deleteDashboardTile,
} from '../services/api';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import AddTileModal from '../components/dashboard/AddTileModal';
import ConfigureTileModal from '../components/dashboard/ConfigureTileModal';
import { withInstitutionColors } from '../helpers/accounts';

function Summary() {
  const [tiles, setTiles] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [showAddTile, setShowAddTile] = useState(false);
  const [configuring, setConfiguring] = useState(null); // { tile, tileType } | null

  const loadTiles = () => getDashboardTiles().then(setTiles);

  useEffect(() => {
    loadTiles();
    Promise.all([getCategories(), getAccounts(), getItems(), getPlanningViews(), getIncome(), getExtensions(), getSettings()])
      .then(([categories, accounts, items, planningViews, incomeSources, extensions, settings]) => {
        setCtx({
          categories,
          accounts: withInstitutionColors(accounts, items),
          planningViews,
          incomeSources,
          extensions,
          dateFormat: settings.date_format || 'MMM D, YYYY',
        });
      });
  }, []);

  if (!tiles || !ctx) {
    return (
      <div className="loading-container">
        <Spinner animation="border" variant="light" style={{ width: 60, height: 60 }} />
      </div>
    );
  }

  const handleAddTile = async (tileType, config) => {
    const y = tiles.reduce((max, t) => Math.max(max, t.y + t.h), 0);
    await createDashboardTile({ type: tileType.type, config, x: 0, y, w: tileType.defaultSize.w, h: tileType.defaultSize.h });
    setShowAddTile(false);
    loadTiles();
  };

  const handleConfigureSave = async (tile, config) => {
    await updateDashboardTile(tile.id, { config });
    setConfiguring(null);
    loadTiles();
  };

  const handleRemove = async (tile) => {
    if (!window.confirm('Remove this tile?')) {
      return;
    }

    await deleteDashboardTile(tile.id);
    loadTiles();
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Floats over the grid instead of reserving its own row, so tiles can occupy the very
          top of the page - it only needs to stay clickable, not stay clear of tile content. */}
      <Button
        variant="primary"
        onClick={() => setShowAddTile(true)}
        style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)' }}
      >
        + Add Tile
      </Button>

      {tiles.length === 0 ? (
        <div className="text-center" style={{ padding: '64px 16px' }}>
          <p className="text-muted">No tiles yet. Click "+ Add Tile" to get started.</p>
        </div>
      ) : (
        <DashboardGrid
          tiles={tiles}
          ctx={ctx}
          onConfigure={(tile, tileType) => setConfiguring({ tile, tileType })}
          onRemove={handleRemove}
        />
      )}

      <AddTileModal show={showAddTile} onClose={() => setShowAddTile(false)} onAdd={handleAddTile} ctx={ctx} />
      <ConfigureTileModal
        show={!!configuring}
        tile={configuring?.tile}
        tileType={configuring?.tileType}
        ctx={ctx}
        onSave={handleConfigureSave}
        onClose={() => setConfiguring(null)}
      />
    </div>
  );
}

export default Summary;
