import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Navbar, Nav, Container } from 'react-bootstrap';

function Navigation() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Navbar expand="lg" expanded={expanded} onToggle={setExpanded} sticky="top" style={{ background: '#0d1117', borderBottom: '1px solid var(--border)' }}>
      <Container fluid>
        <Navbar.Brand as={NavLink} to="/" onClick={() => setExpanded(false)} style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.3em' }}>
          <img src="/logo192.png" alt="" style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8, verticalAlign: 'middle' }} />
          Budgett
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" style={{ borderColor: 'var(--border)' }} />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={NavLink} to="/" onClick={() => setExpanded(false)} style={{ color: '#ccc' }}>Summary</Nav.Link>
            <Nav.Link as={NavLink} to="/transactions" onClick={() => setExpanded(false)} style={{ color: '#ccc' }}>Transactions</Nav.Link>
            <Nav.Link as={NavLink} to="/categories" onClick={() => setExpanded(false)} style={{ color: '#ccc' }}>Categories</Nav.Link>
            <Nav.Link as={NavLink} to="/income" onClick={() => setExpanded(false)} style={{ color: '#ccc' }}>Income</Nav.Link>
            <Nav.Link as={NavLink} to="/settings" onClick={() => setExpanded(false)} style={{ color: '#ccc' }}>Settings</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default Navigation;
