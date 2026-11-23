-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost:3306
-- Tiempo de generación: 23-11-2026 a las 17:22:45
-- Versión del servidor: 10.11.15-MariaDB-cll-lve
-- Versión de PHP: 8.4.28

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `csi62219_quequeda`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `DetalleListaCompra`
--

CREATE TABLE `DetalleListaCompra` (
  `id_detalle` int(11) NOT NULL,
  `id_lista` int(11) NOT NULL,
  `id_producto` int(11) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `comprado` tinyint(1) NOT NULL DEFAULT 0,
  `id_usuario_compra` int(11) DEFAULT NULL,
  `fecha_compra` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Hogar`
--

CREATE TABLE `Hogar` (
  `id_hogar` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Inventario`
--

CREATE TABLE `Inventario` (
  `id_inventario` int(11) NOT NULL,
  `id_hogar` int(11) NOT NULL,
  `id_producto` int(11) NOT NULL,
  `cantidad_actual` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cantidad_minima` decimal(10,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Invitacion_Hogar`
--

CREATE TABLE `Invitacion_Hogar` (
  `id_invitacion` int(11) NOT NULL,
  `id_hogar` int(11) NOT NULL,
  `id_usuario_creador` int(11) NOT NULL,
  `codigo_hash` char(64) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_expiracion` datetime NOT NULL,
  `estado` enum('pendiente','aceptada','vencida','revocada') NOT NULL DEFAULT 'pendiente'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ListaCompra`
--

CREATE TABLE `ListaCompra` (
  `id_lista` int(11) NOT NULL,
  `id_hogar` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'PENDIENTE'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Miembro_Hogar`
--

CREATE TABLE `Miembro_Hogar` (
  `id_miembro` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `id_hogar` int(11) NOT NULL,
  `perfil` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `MovimientoInventario`
--

CREATE TABLE `MovimientoInventario` (
  `id_movimiento` int(11) NOT NULL,
  `id_hogar` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `id_producto` int(11) NOT NULL,
  `tipo_movimiento` varchar(20) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Producto`
--

CREATE TABLE `Producto` (
  `id_producto` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `categoria` varchar(80) DEFAULT NULL,
  `cantidad` decimal(10,2) NOT NULL DEFAULT 1.00,
  `unidad_medida` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `Usuario`
--

CREATE TABLE `Usuario` (
  `id_usuario` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `correo` varchar(150) NOT NULL,
  `contrasena_hash` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `DetalleListaCompra`
--
ALTER TABLE `DetalleListaCompra`
  ADD PRIMARY KEY (`id_detalle`),
  ADD UNIQUE KEY `uq_lista_producto` (`id_lista`,`id_producto`),
  ADD KEY `id_producto` (`id_producto`),
  ADD KEY `fk_detalle_usuario_compra` (`id_usuario_compra`);

--
-- Indices de la tabla `Hogar`
--
ALTER TABLE `Hogar`
  ADD PRIMARY KEY (`id_hogar`);

--
-- Indices de la tabla `Inventario`
--
ALTER TABLE `Inventario`
  ADD PRIMARY KEY (`id_inventario`),
  ADD UNIQUE KEY `id_hogar` (`id_hogar`,`id_producto`),
  ADD KEY `id_producto` (`id_producto`);

--
-- Indices de la tabla `Invitacion_Hogar`
--
ALTER TABLE `Invitacion_Hogar`
  ADD PRIMARY KEY (`id_invitacion`),
  ADD UNIQUE KEY `codigo_hash` (`codigo_hash`),
  ADD KEY `fk_invitacion_creador` (`id_usuario_creador`),
  ADD KEY `idx_invitacion_hogar_estado` (`id_hogar`,`estado`),
  ADD KEY `idx_invitacion_expiracion` (`fecha_expiracion`);

--
-- Indices de la tabla `ListaCompra`
--
ALTER TABLE `ListaCompra`
  ADD PRIMARY KEY (`id_lista`),
  ADD KEY `id_hogar` (`id_hogar`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Indices de la tabla `Miembro_Hogar`
--
ALTER TABLE `Miembro_Hogar`
  ADD PRIMARY KEY (`id_miembro`),
  ADD UNIQUE KEY `id_usuario` (`id_usuario`,`id_hogar`),
  ADD KEY `id_hogar` (`id_hogar`);

--
-- Indices de la tabla `MovimientoInventario`
--
ALTER TABLE `MovimientoInventario`
  ADD PRIMARY KEY (`id_movimiento`),
  ADD KEY `id_hogar` (`id_hogar`),
  ADD KEY `id_usuario` (`id_usuario`),
  ADD KEY `id_producto` (`id_producto`);

--
-- Indices de la tabla `Producto`
--
ALTER TABLE `Producto`
  ADD PRIMARY KEY (`id_producto`);

--
-- Indices de la tabla `Usuario`
--
ALTER TABLE `Usuario`
  ADD PRIMARY KEY (`id_usuario`),
  ADD UNIQUE KEY `correo` (`correo`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `DetalleListaCompra`
--
ALTER TABLE `DetalleListaCompra`
  MODIFY `id_detalle` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `Hogar`
--
ALTER TABLE `Hogar`
  MODIFY `id_hogar` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `Inventario`
--
ALTER TABLE `Inventario`
  MODIFY `id_inventario` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `Invitacion_Hogar`
--
ALTER TABLE `Invitacion_Hogar`
  MODIFY `id_invitacion` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ListaCompra`
--
ALTER TABLE `ListaCompra`
  MODIFY `id_lista` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `Miembro_Hogar`
--
ALTER TABLE `Miembro_Hogar`
  MODIFY `id_miembro` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `MovimientoInventario`
--
ALTER TABLE `MovimientoInventario`
  MODIFY `id_movimiento` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `Producto`
--
ALTER TABLE `Producto`
  MODIFY `id_producto` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `Usuario`
--
ALTER TABLE `Usuario`
  MODIFY `id_usuario` int(11) NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `DetalleListaCompra`
--
ALTER TABLE `DetalleListaCompra`
  ADD CONSTRAINT `DetalleListaCompra_ibfk_1` FOREIGN KEY (`id_lista`) REFERENCES `ListaCompra` (`id_lista`),
  ADD CONSTRAINT `DetalleListaCompra_ibfk_2` FOREIGN KEY (`id_producto`) REFERENCES `Producto` (`id_producto`),
  ADD CONSTRAINT `fk_detalle_usuario_compra` FOREIGN KEY (`id_usuario_compra`) REFERENCES `Usuario` (`id_usuario`);

--
-- Filtros para la tabla `Inventario`
--
ALTER TABLE `Inventario`
  ADD CONSTRAINT `Inventario_ibfk_1` FOREIGN KEY (`id_hogar`) REFERENCES `Hogar` (`id_hogar`),
  ADD CONSTRAINT `Inventario_ibfk_2` FOREIGN KEY (`id_producto`) REFERENCES `Producto` (`id_producto`);

--
-- Filtros para la tabla `Invitacion_Hogar`
--
ALTER TABLE `Invitacion_Hogar`
  ADD CONSTRAINT `fk_invitacion_creador` FOREIGN KEY (`id_usuario_creador`) REFERENCES `Usuario` (`id_usuario`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_invitacion_hogar` FOREIGN KEY (`id_hogar`) REFERENCES `Hogar` (`id_hogar`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `ListaCompra`
--
ALTER TABLE `ListaCompra`
  ADD CONSTRAINT `ListaCompra_ibfk_1` FOREIGN KEY (`id_hogar`) REFERENCES `Hogar` (`id_hogar`),
  ADD CONSTRAINT `ListaCompra_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `Usuario` (`id_usuario`);

--
-- Filtros para la tabla `Miembro_Hogar`
--
ALTER TABLE `Miembro_Hogar`
  ADD CONSTRAINT `Miembro_Hogar_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `Usuario` (`id_usuario`),
  ADD CONSTRAINT `Miembro_Hogar_ibfk_2` FOREIGN KEY (`id_hogar`) REFERENCES `Hogar` (`id_hogar`);

--
-- Filtros para la tabla `MovimientoInventario`
--
ALTER TABLE `MovimientoInventario`
  ADD CONSTRAINT `MovimientoInventario_ibfk_1` FOREIGN KEY (`id_hogar`) REFERENCES `Hogar` (`id_hogar`),
  ADD CONSTRAINT `MovimientoInventario_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `Usuario` (`id_usuario`),
  ADD CONSTRAINT `MovimientoInventario_ibfk_3` FOREIGN KEY (`id_producto`) REFERENCES `Producto` (`id_producto`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
