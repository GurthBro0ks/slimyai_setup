-- MySQL dump 10.13  Distrib 8.0.43, for Linux (x86_64)
--
-- Host: localhost    Database: slimy_ai_bot
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `image_generation_log`
--

DROP TABLE IF EXISTS `image_generation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `image_generation_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` varchar(32) DEFAULT NULL,
  `guild_id` varchar(32) DEFAULT NULL,
  `prompt` text,
  `style` varchar(64) DEFAULT NULL,
  `provider` varchar(32) DEFAULT NULL,
  `result_url` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `image_generation_log`
--

LOCK TABLES `image_generation_log` WRITE;
/*!40000 ALTER TABLE `image_generation_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `image_generation_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `memories`
--

DROP TABLE IF EXISTS `memories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `memories` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(32) NOT NULL,
  `guild_id` varchar(32) DEFAULT NULL,
  `note` text,
  `tags` json DEFAULT NULL,
  `context` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `memories`
--

LOCK TABLES `memories` WRITE;
/*!40000 ALTER TABLE `memories` DISABLE KEYS */;
INSERT INTO `memories` VALUES ('07fab91b-db98-421d-bd29-8c2ea7dee27b','427999592986968074','1176605506912141444','test note','[]','{}','2025-10-09 17:00:06'),('8f8fd8a1-07f4-4d57-b512-350685e25ed7','testuser','testguild','hello from MySQL','[]','{}','2025-10-09 16:47:31');
/*!40000 ALTER TABLE `memories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personality_metrics`
--

DROP TABLE IF EXISTS `personality_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personality_metrics` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `guild_id` varchar(32) DEFAULT NULL,
  `metric` varchar(64) DEFAULT NULL,
  `value_json` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personality_metrics`
--

LOCK TABLES `personality_metrics` WRITE;
/*!40000 ALTER TABLE `personality_metrics` DISABLE KEYS */;
/*!40000 ALTER TABLE `personality_metrics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `snail_stats`
--

DROP TABLE IF EXISTS `snail_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `snail_stats` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` varchar(32) DEFAULT NULL,
  `guild_id` varchar(32) DEFAULT NULL,
  `hp` int DEFAULT NULL,
  `atk` int DEFAULT NULL,
  `def` int DEFAULT NULL,
  `spd` int DEFAULT NULL,
  `pow` int DEFAULT NULL,
  `luck` int DEFAULT NULL,
  `screenshot_hash` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `snail_stats`
--

LOCK TABLES `snail_stats` WRITE;
/*!40000 ALTER TABLE `snail_stats` DISABLE KEYS */;
/*!40000 ALTER TABLE `snail_stats` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-10 13:36:00
