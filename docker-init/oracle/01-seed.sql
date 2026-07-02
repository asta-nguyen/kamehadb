ALTER SESSION SET CONTAINER=FREEPDB1;
CONNECT kameha/kameha@//localhost/FREEPDB1

BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE article_embeddings CASCADE CONSTRAINTS PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE comments CASCADE CONSTRAINTS PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE posts CASCADE CONSTRAINTS PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE users CASCADE CONSTRAINTS PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE organizations CASCADE CONSTRAINTS PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE organizations (
  id NUMBER NOT NULL PRIMARY KEY,
  name VARCHAR2(255) NOT NULL,
  slug VARCHAR2(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE users (
  id NUMBER NOT NULL PRIMARY KEY,
  org_id NUMBER REFERENCES organizations(id),
  name VARCHAR2(255) NOT NULL,
  email VARCHAR2(255) NOT NULL UNIQUE,
  role VARCHAR2(50) DEFAULT 'member' NOT NULL,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE posts (
  id NUMBER NOT NULL PRIMARY KEY,
  user_id NUMBER NOT NULL REFERENCES users(id),
  title VARCHAR2(255) NOT NULL,
  body CLOB,
  published NUMBER(1) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE comments (
  id NUMBER NOT NULL PRIMARY KEY,
  post_id NUMBER NOT NULL REFERENCES posts(id),
  user_id NUMBER NOT NULL REFERENCES users(id),
  body CLOB NOT NULL,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE article_embeddings (
  id NUMBER NOT NULL PRIMARY KEY,
  title VARCHAR2(255) NOT NULL,
  category VARCHAR2(50) NOT NULL,
  embedding VECTOR(3, FLOAT32) NOT NULL
);

INSERT INTO organizations (id, name, slug) VALUES
  (1, 'Acme Inc', 'acme');
INSERT INTO organizations (id, name, slug) VALUES
  (2, 'Globex Corp', 'globex');
INSERT INTO organizations (id, name, slug) VALUES
  (3, 'Initech', 'initech');
INSERT INTO organizations (id, name, slug) VALUES
  (4, 'Umbrella Co', 'umbrella');

INSERT INTO users (id, org_id, name, email, role) VALUES
  (1, 1, 'Alice', 'alice@acme.com', 'admin');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (2, 1, 'Bob', 'bob@acme.com', 'member');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (3, 1, 'Charlie', 'charlie@acme.com', 'member');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (4, 2, 'Carol', 'carol@globex.com', 'admin');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (5, 2, 'David', 'david@globex.com', 'member');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (6, 2, 'Eve', 'eve@globex.com', 'member');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (7, 3, 'Frank', 'frank@initech.com', 'admin');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (8, 3, 'Grace', 'grace@initech.com', 'member');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (9, 4, 'Hank', 'hank@umbrella.com', 'admin');
INSERT INTO users (id, org_id, name, email, role) VALUES
  (10, 4, 'Ivy', 'ivy@umbrella.com', 'member');

INSERT INTO posts (id, user_id, title, body, published) VALUES
  (1, 1, 'Hello World', 'This is the first post.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (2, 1, 'Getting Started with SQL', 'SQL is a powerful language for managing data.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (3, 1, 'Advanced Queries', 'Learn about joins, subqueries, and CTEs.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (4, 2, 'My First Draft', 'Not published yet.', 0);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (5, 2, 'Tips for Beginners', 'Start with the basics and practice daily.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (6, 3, 'Database Design', 'Normalization and indexing explained.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (7, 4, 'Company Announcement', 'Welcome to Globex!', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (8, 4, 'Q4 Results', 'Quarterly performance review.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (9, 5, 'Tech Stack Overview', 'Our technology choices for 2026.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (10, 6, 'Remote Work Guide', 'Best practices for distributed teams.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (11, 7, 'Project Alpha', 'Introducing our new flagship product.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (12, 8, 'Team Building', 'Activities that bring people together.', 0);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (13, 9, 'Security Best Practices', 'Keeping your data safe.', 1);
INSERT INTO posts (id, user_id, title, body, published) VALUES
  (14, 10, 'Onboarding Checklist', 'A guide for new hires.', 1);

INSERT INTO comments (id, post_id, user_id, body) VALUES
  (1, 1, 2, 'Great post!');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (2, 1, 3, 'Thanks for sharing.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (3, 2, 2, 'Very helpful, thanks!');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (4, 2, 4, 'Well written.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (5, 3, 5, 'Could you add more examples?');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (6, 3, 6, 'This cleared up a lot of confusion.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (7, 5, 1, 'Great tips for newcomers.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (8, 6, 7, 'Excellent explanation of B-tree indexes.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (9, 7, 8, 'Exciting news!');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (10, 9, 9, 'Interesting tech choices.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (11, 10, 10, 'Saving this for my team.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (12, 11, 1, 'Can not wait for the launch!');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (13, 13, 2, 'This should be required reading.');
INSERT INTO comments (id, post_id, user_id, body) VALUES
  (14, 14, 3, 'Perfect timing, we just hired two people.');

INSERT INTO article_embeddings (id, title, category, embedding) VALUES
  (1, 'Vector basics', 'ml', '[0.10, 0.20, 0.30]');
INSERT INTO article_embeddings (id, title, category, embedding) VALUES
  (2, 'Nearest neighbors', 'ml', '[0.12, 0.18, 0.27]');
INSERT INTO article_embeddings (id, title, category, embedding) VALUES
  (3, 'Finance report', 'business', '[0.80, 0.10, 0.05]');
INSERT INTO article_embeddings (id, title, category, embedding) VALUES
  (4, 'Marketing copy', 'content', '[0.55, 0.42, 0.11]');
