import React from 'react';
import { NavLink } from 'react-router-dom';
import { Navbar, Nav, Container } from 'react-bootstrap';

function Navigation() {
  return (
    <Navbar expand="lg" sticky="top" style={{ background: '#0d1117', borderBottom: '1px solid var(--border)' }}>
      <Container fluid>
        <Navbar.Brand as={NavLink} to="/" style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.3em' }}>
          Budgett
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" style={{ borderColor: 'var(--border)' }} />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={NavLink} to="/" style={{ color: '#ccc' }}>Summary</Nav.Link>
            <Nav.Link as={NavLink} to="/transactions" style={{ color: '#ccc' }}>Transactions</Nav.Link>
            <Nav.Link as={NavLink} to="/categories" style={{ color: '#ccc' }}>Categories</Nav.Link>
            <Nav.Link as={NavLink} to="/income" style={{ color: '#ccc' }}>Income</Nav.Link>
            <Nav.Link as={NavLink} to="/settings" style={{ color: '#ccc' }}>Settings</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default Navigation;
